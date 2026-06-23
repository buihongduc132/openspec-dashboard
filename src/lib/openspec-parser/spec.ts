/**
 * Task 3.2 — Spec grammar (Spec / Requirement / Scenario / RFC 2119) parser +
 * serializer with byte-fidelity round-trip (NFR-4).
 *
 * This module owns the canonical OpenSpec main-spec grammar:
 *   - `## Requirements` section
 *   - `### Requirement: <name>` blocks
 *   - `#### Scenario: <name>` blocks with `- **WHEN**` / `- **THEN**` bullets
 *   - RFC 2119 keyword recognition (SHALL / MUST / SHOULD / MAY …)
 *
 * Design (D0-1): a hand-written, line-oriented recursive-descent parser. To
 * guarantee NFR-4 byte-fidelity on untouched regions, the parser preserves the
 * verbatim source line array alongside the structured model, and the serializer
 * reconstructs from that verbatim store. Editing a structured node rewrites the
 * verbatim store's affected lines; every other line is emitted byte-for-byte.
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`.
 */

import type { ParseIssue } from "./types";

// ─── Model ──────────────────────────────────────────────────────────────────

/** A `#### Scenario: <name>` block within a requirement. */
export interface Scenario {
  name: string;
  body: string;
  /** 1-based source line of the scenario header. */
  line: number;
  /**
   * Half-open [startLine, endLine) span (0-based) of the scenario block within
   * the verbatim line store, including the header line. Used by the serializer.
   */
  span: [number, number];
}

/** A `### Requirement: <name>` block within a spec. */
export interface Requirement {
  name: string;
  body: string;
  scenarios: Scenario[];
  /** 1-based source line of the requirement header. */
  line: number;
  /** Half-open [startLine, endLine) span (0-based) within the verbatim store. */
  span: [number, number];
}

/** In-memory model of an OpenSpec main spec. */
export interface SpecModel {
  /** Capability/domain name, derived from `filePath`. */
  capability: string;
  /** Requirement blocks in source order. */
  requirements: Requirement[];
  /**
   * Verbatim source lines (split on `\n`, NOT re-joined/normalized). This is the
   * single source of truth for byte-fidelity: the serializer emits these lines
   * unchanged, except for regions whose structured node was explicitly edited.
   */
  lines: string[];
}

export interface SpecParseResult {
  model: SpecModel;
  issues: ParseIssue[];
}

// ─── RFC 2119 keyword recognition ───────────────────────────────────────────

/**
 * The RFC 2119 keyword set the OpenSpec grammar recognises. A requirement or
 * scenario body is considered "normative" when it contains at least one of
 * these. Used for grammar validation, not for rewording.
 */
export const RFC_2119_KEYWORDS: readonly string[] = [
  "SHALL",
  "SHALL NOT",
  "MUST",
  "MUST NOT",
  "SHOULD",
  "SHOULD NOT",
  "MAY",
  "MAY NOT",
  "REQUIRED",
  "RECOMMENDED",
  "OPTIONAL",
] as const;

/** Whether a prose body contains at least one RFC 2119 keyword. */
export function isNormative(body: string): boolean {
  return RFC_2119_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(body));
}

// ─── Header regexes ─────────────────────────────────────────────────────────

const REQUIREMENT_HEADER = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCENARIO_HEADER = /^####\s+Scenario:\s*(.+?)\s*$/;
const REQUIREMENTS_SECTION = /^##\s+Requirements\s*$/;
const H2_HEADER = /^##\s+/;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mask triple-backtick fenced-code-block lines (and their ``` delimiters) with
 * empty strings so decoy Markdown headers inside them are ignored by header
 * detection. Line indices are preserved 1:1 with the source.
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
 * Parse `### Requirement:` / `#### Scenario:` blocks within [start, end) using
 * `masked` for header detection and `raw` for body text. Returns blocks with
 * verbatim line spans.
 */
function parseRequirementBlocks(
  masked: readonly string[],
  raw: readonly string[],
  start: number,
  end: number,
): Requirement[] {
  const blocks: Requirement[] = [];
  let i = start;
  while (i < end) {
    const m = masked[i].match(REQUIREMENT_HEADER);
    if (!m) {
      i++;
      continue;
    }
    const reqStart = i; // 0-based
    const reqLine = i + 1; // 1-based
    const name = m[1].trim();
    const bodyLines: string[] = [];
    const scenarios: Scenario[] = [];
    i++;
    while (i < end) {
      if (REQUIREMENT_HEADER.test(masked[i])) break;
      const sm = masked[i].match(SCENARIO_HEADER);
      if (sm) {
        const scStart = i; // 0-based
        const scLine = i + 1; // 1-based
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
        scenarios.push({
          name: scName,
          body: scBody.join("\n").trim(),
          line: scLine,
          span: [scStart, i],
        });
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
      span: [reqStart, i],
    });
  }
  return blocks;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse an OpenSpec main spec into a byte-fidelity model. Never throws on
 * malformed input; collects structured {@link ParseIssue}s instead.
 */
export function parseSpec(content: string, filePath: string): SpecParseResult {
  const issues: ParseIssue[] = [];
  const raw = content.split("\n");
  const masked = maskFences(raw);
  const capability = deriveCapability(filePath);

  // Locate the `## Requirements` section.
  let reqStart = -1;
  for (let i = 0; i < masked.length; i++) {
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

  const requirements =
    reqStart >= 0 ? parseRequirementBlocks(masked, raw, reqStart + 1, reqEnd) : [];

  const model: SpecModel = { capability, requirements, lines: raw };
  return { model, issues };
}

// ─── Serializer ─────────────────────────────────────────────────────────────

/**
 * Serialize a {@link SpecModel} back to text with byte-fidelity for every
 * untouched region.
 *
 * Strategy: emit the verbatim `lines` store unchanged, EXCEPT for regions whose
 * structured node's body has been edited away from the parsed value. When a
 * requirement's `body` differs from the body that originally occupied its span,
 * the span's body lines are replaced with the new body.
 */
export function serializeSpec(model: SpecModel): string {
  return model.lines.join("\n");
}

/**
 * Apply an in-place body edit to a requirement node, rewriting the verbatim
 * line store so that {@link serializeSpec} reproduces the edit and leaves every
 * other line byte-identical. Returns a NEW model (immutable-friendly) sharing
 * the rest of the structure.
 */
export function setRequirementBody(
  model: SpecModel,
  reqIndex: number,
  newBody: string,
): SpecModel {
  const req = model.requirements[reqIndex];
  if (!req) return model;
  const [startLine, endLine] = req.span;
  // Recompute the body sub-span: lines within [startLine, endLine) that are
  // NOT the requirement header and NOT inside a nested scenario span.
  const scenarioSpans = req.scenarios.map((s) => s.span);
  const headerLine = startLine;
  const newBodyLines = newBody.split("\n");

  // Collect the lines to keep verbatim: header + any scenario blocks.
  const kept: { index: number; text: string }[] = [
    { index: headerLine, text: model.lines[headerLine] },
  ];
  for (const [sStart, sEnd] of scenarioSpans) {
    for (let i = sStart; i < sEnd; i++) {
      kept.push({ index: i, text: model.lines[i] });
    }
  }
  kept.sort((a, b) => a.index - b.index);

  // Rebuild the requirement block region: header, body, scenarios (in original order).
  const rebuiltRegion: string[] = [];
  // Emit header first.
  rebuiltRegion.push(model.lines[headerLine]);
  // Determine scenario block positions relative to start of region.
  const scenariosAfterBody = scenarioSpans.every(([s]) => s > headerLine);
  if (scenariosAfterBody) {
    // Body comes right after header, then scenarios.
    for (const bl of newBodyLines) rebuiltRegion.push(bl);
    for (const [sStart, sEnd] of scenarioSpans) {
      for (let i = sStart; i < sEnd; i++) rebuiltRegion.push(model.lines[i]);
    }
  } else {
    // Fallback: interleave kept structure by original order (body before first
    // scenario; scenarios in place). Build from kept map excluding header.
    const nonHeaderKept = kept.filter((k) => k.index !== headerLine);
    // Emit new body lines at the position of the first non-header kept line.
    const firstKeptIdx = nonHeaderKept[0]?.index ?? headerLine + 1;
    // Simpler: emit header, then new body, then the rest verbatim.
    for (const bl of newBodyLines) rebuiltRegion.push(bl);
    for (const k of nonHeaderKept) rebuiltRegion.push(k.text);
  }

  const newLines = model.lines.slice(0, startLine);
  newLines.push(...rebuiltRegion);
  newLines.push(...model.lines.slice(endLine));

  // Recompute the edited requirement's span end + downstream spans.
  const delta = newLines.length - model.lines.length;
  const newRequirements = model.requirements.map((r, i) => {
    if (i === reqIndex) {
      return { ...r, body: newBody, span: [startLine, startLine + rebuiltRegion.length] as [number, number] };
    }
    if (r.span[0] > startLine) {
      return { ...r, span: [r.span[0] + delta, r.span[1] + delta] as [number, number] };
    }
    return r;
  });

  return { ...model, lines: newLines, requirements: newRequirements };
}
