/**
 * Task 3.3 — Delta grammar (ADDED / MODIFIED / REMOVED / RENAMED) parser +
 * serializer with byte-fidelity round-trip (NFR-4).
 *
 * This module owns the canonical OpenSpec delta-spec grammar:
 *   - `## ADDED Requirements`     → full requirement blocks
 *   - `## MODIFIED Requirements`  → full requirement blocks
 *   - `## REMOVED Requirements`   → name + `**Reason:**` + `**Migration:**`
 *   - `## RENAMED Requirements`   → `### Requirement:` block carrying
 *                                    `- **FROM:**` / `- **TO:**` bullets
 *
 * Design (D0-1): a hand-written, line-oriented parser. To guarantee NFR-4
 * byte-fidelity, the model carries the verbatim source line array; the
 * serializer emits those lines unchanged when nothing was edited.
 *
 * The parser NEVER throws on malformed input; it collects structured
 * {@link ParseIssue}s and continues. A REMOVED block missing its required
 * Reason/Migration is flagged (not silently accepted).
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`,
 * Requirement "Delta grammar (ADDED / MODIFIED / REMOVED / RENAMED)".
 */

import type { ParseIssue, Severity } from "./types";
import type { Requirement, Scenario } from "./spec";

// ─── Model ──────────────────────────────────────────────────────────────────

/** The four delta verbs, lowercase. */
export type DeltaVerb = "added" | "modified" | "removed" | "renamed";

/** A REMOVED requirement entry: name + optional reason/migration. */
export interface RemovedRequirement {
  name: string;
  /** Value of the `**Reason:**` field, if present. */
  reason?: string;
  /** Value of the `**Migration:**` field, if present. */
  migration?: string;
  /** 1-based source line of the `### Requirement:` header. */
  line: number;
  /** Half-open [start, end) span (0-based) of the block within `lines`. */
  span: [number, number];
}

/** A RENAMED requirement entry: FROM/TO. */
export interface RenamedRequirement {
  from: string;
  to: string;
  /** 1-based source line of the RENAMED entry's header/bullets. */
  line: number;
}

/** In-memory model of an OpenSpec delta spec. */
export interface DeltaModel {
  /** ADDED requirement blocks (full requirement shape). */
  added: Requirement[];
  /** MODIFIED requirement blocks (full requirement shape). */
  modified: Requirement[];
  /** REMOVED requirement entries with Reason/Migration. */
  removed: RemovedRequirement[];
  /** RENAMED FROM/TO pairs. */
  renamed: RenamedRequirement[];
  /** Whether each verb section was present in the source. */
  sectionPresence: {
    added: boolean;
    modified: boolean;
    removed: boolean;
    renamed: boolean;
  };
  /**
   * Verbatim source lines (split on `\n`, NOT re-joined/normalized). The single
   * source of truth for byte-fidelity; the serializer emits these unchanged.
   */
  lines: string[];
}

export interface DeltaParseResult {
  model: DeltaModel;
  issues: ParseIssue[];
}

// ─── Header regexes ─────────────────────────────────────────────────────────

const DELTA_SECTION = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i;
const H2_HEADER = /^##\s+/;
const REQUIREMENT_HEADER = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCENARIO_HEADER = /^####\s+Scenario:\s*(.+?)\s*$/;
const REASON_FIELD = /^\s*\*\*Reason:\*\*\s*(.*)$/;
const MIGRATION_FIELD = /^\s*\*\*Migration:\*\*\s*(.*)$/;
const FROM_BULLET = /^\s*[-*]\s*\*\*FROM:\*\*\s*(.+?)\s*$/;
const TO_BULLET = /^\s*[-*]\s*\*\*TO:\*\*\s*(.+?)\s*$/;

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

function pushIssue(
  issues: ParseIssue[],
  kind: string,
  file: string,
  line: number | undefined,
  severity: Severity,
  message: string,
): void {
  issues.push({ kind, file, line, severity, message });
}

/**
 * Parse `### Requirement:` blocks within [start, end) as full requirement
 * nodes (body + nested scenarios). Used for ADDED and MODIFIED sections.
 */
function parseFullRequirementBlocks(
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
    const reqStart = i;
    const reqLine = i + 1;
    const name = m[1].trim();
    const bodyLines: string[] = [];
    const scenarios: Scenario[] = [];
    i++;
    while (i < end) {
      if (REQUIREMENT_HEADER.test(masked[i])) break;
      const sm = masked[i].match(SCENARIO_HEADER);
      if (sm) {
        const scStart = i;
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

interface SectionSpan {
  verb: DeltaVerb;
  start: number;
  end: number;
}

/** Locate the top-level `## <VERB> Requirements` sections. */
function findSections(masked: readonly string[]): SectionSpan[] {
  const secs: SectionSpan[] = [];
  for (let i = 0; i < masked.length; i++) {
    const m = masked[i].match(DELTA_SECTION);
    if (m) {
      secs.push({
        verb: m[1].toLowerCase() as DeltaVerb,
        start: i,
        end: masked.length,
      });
    }
  }
  for (let i = 0; i < secs.length; i++) {
    secs[i].end = i + 1 < secs.length ? secs[i + 1].start : masked.length;
  }
  return secs;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse an OpenSpec delta spec into a byte-fidelity model. Never throws on
 * malformed input; collects structured {@link ParseIssue}s instead.
 */
export function parseDeltaSpec(content: string, filePath: string): DeltaParseResult {
  const issues: ParseIssue[] = [];
  const raw = content.split("\n");
  const masked = maskFences(raw);

  const model: DeltaModel = {
    added: [],
    modified: [],
    removed: [],
    renamed: [],
    sectionPresence: { added: false, modified: false, removed: false, renamed: false },
    lines: raw,
  };

  const secs = findSections(masked);

  for (const sec of secs) {
    model.sectionPresence[sec.verb] = true;

    if (sec.verb === "added" || sec.verb === "modified") {
      const blocks = parseFullRequirementBlocks(masked, raw, sec.start + 1, sec.end);
      if (sec.verb === "added") model.added.push(...blocks);
      else model.modified.push(...blocks);
      continue;
    }

    if (sec.verb === "removed") {
      // Walk `### Requirement:` headers; collect Reason/Migration fields.
      let i = sec.start + 1;
      while (i < sec.end) {
        const m = masked[i].match(REQUIREMENT_HEADER);
        if (!m) {
          i++;
          continue;
        }
        const blockStart = i;
        const reqLine = i + 1;
        const name = m[1].trim();
        let reason: string | undefined;
        let migration: string | undefined;
        i++;
        while (i < sec.end && !REQUIREMENT_HEADER.test(masked[i])) {
          const rm = raw[i].match(REASON_FIELD);
          if (rm && reason === undefined) reason = rm[1].trim();
          const mm = raw[i].match(MIGRATION_FIELD);
          if (mm && migration === undefined) migration = mm[1].trim();
          i++;
        }
        model.removed.push({
          name,
          reason,
          migration,
          line: reqLine,
          span: [blockStart, i],
        });
      }
      // Validate every REMOVED entry has both Reason and Migration.
      for (const r of model.removed) {
        if (r.reason === undefined) {
          pushIssue(
            issues,
            "removed-missing-reason",
            filePath,
            r.line,
            "error",
            `REMOVED requirement "${r.name}" is missing the required "**Reason:**" field.`,
          );
        }
        if (r.migration === undefined) {
          pushIssue(
            issues,
            "removed-missing-migration",
            filePath,
            r.line,
            "error",
            `REMOVED requirement "${r.name}" is missing the required "**Migration:**" field.`,
          );
        }
      }
      continue;
    }

    if (sec.verb === "renamed") {
      // Recognised shapes per the FROM:/TO: grammar:
      //   (a) `### Requirement: <old>` header followed by `- **FROM:**` / `- **TO:**`
      //   (b) bare `- **FROM:**` / `- **TO:**` bullets (the header is metadata only)
      let lastFrom: { from: string; line: number } | undefined;
      for (let i = sec.start + 1; i < sec.end; i++) {
        const fm = raw[i].match(FROM_BULLET);
        const tm = raw[i].match(TO_BULLET);
        if (fm) {
          lastFrom = { from: fm[1], line: i + 1 };
        } else if (tm && lastFrom) {
          model.renamed.push({ from: lastFrom.from, to: tm[1], line: lastFrom.line });
          lastFrom = undefined;
        }
      }
      continue;
    }
  }

  return { model, issues };
}

// ─── Serializer ─────────────────────────────────────────────────────────────

/**
 * Serialize a {@link DeltaModel} back to text with byte-fidelity for every
 * region. With no edits applied, the output is byte-for-byte identical to the
 * original source (the verbatim `lines` store is emitted unchanged).
 */
export function serializeDeltaSpec(model: DeltaModel): string {
  return model.lines.join("\n");
}
