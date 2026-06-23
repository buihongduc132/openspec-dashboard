/**
 * Task 1.7 — OpenSpec parser port (TypeScript).
 *
 * Produces a stable in-memory model of the upstream OpenSpec Markdown tree:
 * main specs, delta specs, tasks, config, changes, and whole projects.
 *
 * Design principles (dashboard-foundation spec, NFR-5/INV-2):
 *  - The parser NEVER throws on malformed input. Structured {@link ParseIssue}s
 *    are collected and parsing continues.
 *  - Any upstream construct outside the documented rule set
 *    ({@link DOCUMENTED_RULES}) is appended to a {@link GapRegistry} and parsing
 *    continues, never silently mishandled.
 *
 * Source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "OpenSpec parser port").
 */

import {
  DOCUMENTED_RULES,
  DOCUMENTED_RULE_IDS,
} from "./rules";
import {
  createGapRegistry,
  recordUnknownFrontmatter,
  type GapRegistry,
} from "./gap-registry";
import type {
  ChangeArtifacts,
  ChangeModel,
  ConfigModel,
  DeltaSpec,
  DeltaSpecResult,
  MainSpecModel,
  MainSpecResult,
  ParseIssue,
  ProjectModel,
  RequirementBlock,
  Scenario,
  SpecModel,
  TaskItem,
  TasksResult,
} from "./types";

export type { ChangeModel, ProjectModel, MainSpecResult, DeltaSpecResult, TasksResult } from "./types";
export type { RequirementBlock, Scenario, TaskItem, SpecModel, DeltaSpec, ConfigModel, ParseIssue } from "./types";
export {
  DOCUMENTED_RULES,
  DOCUMENTED_RULE_IDS,
} from "./rules";
export {
  createGapRegistry,
  recordUnknownFrontmatter,
} from "./gap-registry";
export type { GapRegistry, GapEntry } from "./gap-registry";
export type { DocumentedRule } from "./rules";

/**
 * Version of the in-tree OpenSpec parser port (req 08 §8.1 — exposed via the
 * health endpoint). Bumped when the parser grammar/semantics change in a
 * way consumers can observe. Follows semver within Phase 0.
 */
export const PARSER_VERSION = "0.1.0";

// ─── Options ────────────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Optional gap registry to record unrecognised upstream constructs into. */
  gap?: GapRegistry;
}

// ─── Header regexes ─────────────────────────────────────────────────────────

const REQUIREMENT_HEADER = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCENARIO_HEADER = /^####\s+Scenario:\s*(.+?)\s*$/;
const REQUIREMENTS_SECTION = /^##\s+Requirements\s*$/;
const DELTA_SECTION = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i;
const H2_HEADER = /^##\s+/;
const TASK_LINE = /^(\s*)-\s*\[([ xX])\]\s+(.*)$/;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Replace fenced-code-block lines (and their ``` delimiters) with empty strings
 * so that decoy Markdown headers inside them are ignored by header detection.
 * Line numbers are preserved 1:1 with the source.
 */
function maskFences(lines: readonly string[]): string[] {
  const out = lines.slice();
  let inFence = false;
  for (let i = 0; i < out.length; i++) {
    if (/^\s*```/.test(out[i])) {
      inFence = !inFence;
      out[i] = "";
      continue;
    }
    if (inFence) out[i] = "";
  }
  return out;
}

/**
 * Derive the capability/domain name from a spec file path. For a path of the
 * form `.../specs/<domain>/spec.md` the domain is `<domain>`.
 */
function deriveCapability(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const specIdx = parts.lastIndexOf("specs");
  if (specIdx >= 0 && specIdx + 1 < parts.length) return parts[specIdx + 1];
  if (parts.length >= 2 && parts[parts.length - 1] === "spec.md") {
    return parts[parts.length - 2];
  }
  return parts[parts.length - 1] ?? "unknown";
}

/**
 * Parse `### Requirement: <name>` blocks within [start, end) using `masked` for
 * header detection and `raw` for body text. Returns blocks in source order.
 */
function parseRequirementBlocks(
  masked: readonly string[],
  raw: readonly string[],
  start: number,
  end: number,
): RequirementBlock[] {
  const blocks: RequirementBlock[] = [];
  let i = start;
  while (i < end) {
    const m = masked[i].match(REQUIREMENT_HEADER);
    if (!m) {
      i++;
      continue;
    }
    const reqLine = i + 1;
    const name = m[1].trim();
    const bodyLines: string[] = [];
    const scenarios: Scenario[] = [];
    i++;
    while (i < end) {
      if (REQUIREMENT_HEADER.test(masked[i])) break;
      const sm = masked[i].match(SCENARIO_HEADER);
      if (sm) {
        const scLine = i + 1;
        const scName = sm[1].trim();
        const scBody: string[] = [];
        i++;
        while (
          i < end &&
          !REQUIREMENT_HEADER.test(masked[i]) &&
          !SCENARIO_HEADER.test(masked[i])
        ) {
          scBody.push(raw[i]);
          i++;
        }
        scenarios.push({ name: scName, body: scBody.join("\n").trim(), line: scLine });
        continue;
      }
      bodyLines.push(raw[i]);
      i++;
    }
    blocks.push({
      name,
      body: bodyLines.join("\n").trim(),
      scenarios,
      line: reqLine,
    });
  }
  return blocks;
}

// ─── Frontmatter ────────────────────────────────────────────────────────────

interface FrontmatterInfo {
  /** 0-based line index where spec body begins (after closing `---`). */
  bodyStart: number;
  /** Scalar keys observed in the frontmatter block. */
  keys: Record<string, string>;
}

/** Detect and slice a leading `---`-delimited frontmatter block, if present. */
function readFrontmatter(lines: readonly string[]): FrontmatterInfo {
  if (lines[0]?.trim() !== "---") {
    return { bodyStart: 0, keys: {} };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return { bodyStart: 0, keys: {} };
  const keys: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (m) keys[m[1]] = m[2].trim();
  }
  return { bodyStart: end + 1, keys };
}

// ─── parseMainSpec ──────────────────────────────────────────────────────────

export function parseMainSpec(
  content: string,
  filePath: string,
  opts?: ParseOptions,
): MainSpecResult {
  const issues: ParseIssue[] = [];
  const gap = opts?.gap;
  const raw = content.split("\n");

  const fm = readFrontmatter(raw);
  if (gap && Object.keys(fm.keys).length > 0) {
    recordUnknownFrontmatter(filePath, fm.keys, gap);
  }

  const masked = maskFences(raw);
  const capability = deriveCapability(filePath);

  // delta-header in a main spec is an error.
  for (let i = 0; i < masked.length; i++) {
    if (DELTA_SECTION.test(masked[i])) {
      issues.push({
        kind: "delta-header",
        file: filePath,
        line: i + 1,
        severity: "error",
        message:
          "Delta section header (ADDED/MODIFIED/REMOVED/RENAMED Requirements) is not allowed in a main spec.",
      });
    }
  }

  // Locate the `## Requirements` section.
  let reqStart = -1;
  for (let i = fm.bodyStart; i < masked.length; i++) {
    if (REQUIREMENTS_SECTION.test(masked[i])) {
      reqStart = i;
      break;
    }
  }
  let reqEnd = masked.length;
  if (reqStart >= 0) {
    for (let i = reqStart + 1; i < masked.length; i++) {
      if (H2_HEADER.test(masked[i])) {
        reqEnd = i;
        break;
      }
    }
  }

  // Requirement headers outside the Requirements section are a warning.
  for (let i = 0; i < masked.length; i++) {
    if (REQUIREMENT_HEADER.test(masked[i])) {
      if (reqStart < 0 || i < reqStart || i >= reqEnd) {
        issues.push({
          kind: "requirement-outside-requirements",
          file: filePath,
          line: i + 1,
          severity: "warn",
          message: "Requirement header appears outside the '## Requirements' section.",
        });
      }
    }
  }

  const requirements: RequirementBlock[] =
    reqStart >= 0 ? parseRequirementBlocks(masked, raw, reqStart + 1, reqEnd) : [];

  const model: MainSpecModel = { capability, requirements };
  return { model, issues };
}

// ─── parseDeltaSpec ─────────────────────────────────────────────────────────

export function parseDeltaSpec(content: string, filePath: string): DeltaSpecResult {
  const issues: ParseIssue[] = [];
  const raw = content.split("\n");
  const masked = maskFences(raw);

  interface Sec {
    verb: "added" | "modified" | "removed" | "renamed";
    start: number;
    end: number;
  }
  const secs: Sec[] = [];
  for (let i = 0; i < masked.length; i++) {
    const m = masked[i].match(DELTA_SECTION);
    if (m) {
      secs.push({
        verb: m[1].toLowerCase() as Sec["verb"],
        start: i,
        end: masked.length,
      });
    }
  }
  for (let i = 0; i < secs.length; i++) {
    secs[i].end = i + 1 < secs.length ? secs[i + 1].start : masked.length;
  }

  const added: RequirementBlock[] = [];
  const modified: RequirementBlock[] = [];
  const removed: string[] = [];
  const renamed: { from: string; to: string }[] = [];
  const sectionPresence = {
    added: false,
    modified: false,
    removed: false,
    renamed: false,
  };

  for (const sec of secs) {
    sectionPresence[sec.verb] = true;
    const blocks = parseRequirementBlocks(masked, raw, sec.start + 1, sec.end);
    if (sec.verb === "added") added.push(...blocks);
    else if (sec.verb === "modified") modified.push(...blocks);
    else if (sec.verb === "removed") removed.push(...blocks.map((b) => b.name));
    else if (sec.verb === "renamed") {
      for (let i = 0; i + 1 < blocks.length; i += 2) {
        renamed.push({ from: blocks[i].name, to: blocks[i + 1].name });
      }
      if (blocks.length % 2 !== 0) {
        issues.push({
          kind: "renamed-unpaired",
          file: filePath,
          line: blocks[blocks.length - 1].line,
          severity: "warn",
          message: "RENAMED section has an unpaired requirement header.",
        });
      }
    }
  }

  return {
    plan: { added, modified, removed, renamed, sectionPresence },
    issues,
  };
}

// ─── parseTasks ─────────────────────────────────────────────────────────────

export function parseTasks(content: string, filePath: string): TasksResult {
  const issues: ParseIssue[] = [];
  const lines = content.split("\n");
  const items: TaskItem[] = [];

  interface Frame {
    indent: number;
    item: TaskItem;
  }
  const stack: Frame[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_LINE);
    if (!m) continue;
    const indent = m[1].length;
    const markerChar = m[2];
    const label = m[3].trim();
    const item: TaskItem = {
      marker: `[${markerChar}]`,
      checked: markerChar !== " ",
      label,
      line: i + 1,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      items.push(item);
    } else {
      stack[stack.length - 1].item.children.push(item);
    }
    stack.push({ indent, item });
  }

  return { items, issues };
}

// ─── parseConfigYaml ────────────────────────────────────────────────────────

/**
 * Minimal YAML reader for the scalar/sequence keys the dashboard cares about.
 * Avoids a full YAML dependency for the documented upstream config rules.
 */
export function parseConfigYaml(content: string): ConfigModel {
  const result: ConfigModel = { defaultSchema: null, profiles: [], tools: [] };
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const schemaMatch = line.match(/^(?:defaultSchema|schema):\s*(.*)$/);
    if (schemaMatch) {
      const value = schemaMatch[1].trim();
      if (value && result.defaultSchema === null) result.defaultSchema = value;
      i++;
      continue;
    }

    const toolsMatch = line.match(/^tools:\s*$/);
    if (toolsMatch) {
      i++;
      while (i < lines.length) {
        const item = lines[i].match(/^\s+-\s+(.+)$/);
        if (!item) break;
        result.tools.push(item[1].trim());
        i++;
      }
      continue;
    }

    const profilesMatch = line.match(/^profiles:\s*$/);
    if (profilesMatch) {
      i++;
      while (i < lines.length) {
        const item = lines[i].match(/^\s+-\s+(.+)$/);
        if (!item) break;
        result.profiles.push(item[1].trim());
        i++;
      }
      continue;
    }

    i++;
  }
  return result;
}

// ─── parseChange ────────────────────────────────────────────────────────────

export function parseChange(name: string, files: Record<string, string>): ChangeModel {
  const issues: ParseIssue[] = [];
  const artifacts: ChangeArtifacts = { other: {} };
  let tasks: TasksResult = { items: [], issues: [] };
  const deltaSpecs: Record<string, DeltaSpec> = {};

  for (const [path, content] of Object.entries(files)) {
    const norm = path.replace(/\\/g, "/");
    const base = norm.split("/").pop() ?? norm;

    if (base === "proposal.md") {
      artifacts.proposal = content;
      continue;
    }
    if (base === "design.md") {
      artifacts.design = content;
      continue;
    }
    if (base === "tasks.md") {
      tasks = parseTasks(content, norm);
      continue;
    }

    const deltaMatch = norm.match(/specs\/([^/]+)\/spec\.md$/);
    if (deltaMatch) {
      const domain = deltaMatch[1];
      const { plan, issues: deltaIssues } = parseDeltaSpec(content, norm);
      deltaSpecs[domain] = { domain, plan, issues: deltaIssues };
      continue;
    }

    if (base.endsWith(".md")) {
      artifacts.other[base] = content;
    }
  }

  return { name, artifacts, tasks, deltaSpecs, issues };
}

// ─── parseProject ───────────────────────────────────────────────────────────

export function parseProject(files: Record<string, string>): ProjectModel {
  const issues: ParseIssue[] = [];
  let config: ConfigModel = { defaultSchema: null, profiles: [], tools: [] };
  const specs: SpecModel[] = [];
  const changeFiles: Record<string, Record<string, string>> = {};

  for (const [path, content] of Object.entries(files)) {
    const norm = path.replace(/\\/g, "/");

    if (norm === "config.yaml" || norm.endsWith("/config.yaml")) {
      config = parseConfigYaml(content);
      continue;
    }

    const changeMatch = norm.match(/^changes\/([^/]+)\/(.*)$/);
    if (changeMatch) {
      const changeName = changeMatch[1];
      const rel = changeMatch[2];
      (changeFiles[changeName] ??= {})[rel] = content;
      continue;
    }

    const specMatch = norm.match(/specs\/([^/]+)\/spec\.md$/);
    if (specMatch) {
      const { model } = parseMainSpec(content, norm);
      specs.push({
        capability: model.capability,
        filePath: norm,
        requirements: model.requirements,
      });
      continue;
    }
  }

  const changes: ChangeModel[] = Object.entries(changeFiles).map(([cname, cfiles]) =>
    parseChange(cname, cfiles),
  );

  return { config, specs, changes, issues };
}
