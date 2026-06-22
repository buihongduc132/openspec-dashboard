/**
 * Task 2.16 — Change module editors (req 03.1–3.10).
 *
 * Pure helpers backing the change module's proposal/design/delta/task
 * editors. Everything here is deterministic and side-effect free so it can
 * be unit-tested without a database. The route layer composes these with DB
 * access; the client editor components call the routes.
 *
 *   - 3.3 Change creation: kebab-case name validation + scaffold.
 *   - 3.4 Change metadata edit (handled at the route layer).
 *   - 3.5 Artifact status tracking (done/ready/blocked/invalid).
 *   - 3.6 Change validation (structural integrity).
 *   - 3.7/3.8 Proposal & design editors (content flows through artifact rows).
 *   - 3.9 Delta spec editor (verb grammar lives in propose-change/delta-serialize).
 *   - 3.10 Task editor: MAX_TASK_DEPTH constant + deterministic numbering.
 */

import { DELTA_VERBS, type DeltaVerb } from "@/lib/propose-change/delta-serialize";

// ─── 3.3 Change name validation ─────────────────────────────────────────────

/**
 * Canonical OpenSpec change-name grammar: lowercase kebab-case, digits
 * allowed, single dashes between tokens, no leading/trailing/double dashes.
 * Source: req 03.3 ("name (kebab-case, uniqueness-checked)").
 */
export const CHANGE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$|^[a-z][a-z0-9]*$/;

/** True iff `name` is canonical kebab-case (req 03.3). */
export function validateChangeName(name: string): boolean {
  return CHANGE_NAME_PATTERN.test(name);
}

// ─── 3.3 Change scaffold ────────────────────────────────────────────────────

export interface ScaffoldOptions {
  name: string;
  schema?: string;
  description?: string;
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

/**
 * Scaffold the canonical artifact files for a new change so it passes
 * `openspec validate` immediately (req 03.3 AC (a)). The four built-in
 * artifacts of the `spec-driven` schema are: proposal, design, tasks, and
 * delta specs. Delta specs are created on demand via the propose-via-change
 * flow; the other three are scaffolded empty-but-present here.
 */
export function scaffoldChange(opts: ScaffoldOptions): ScaffoldedFile[] {
  const name = opts.name;
  return [
    {
      path: "proposal.md",
      content: [
        "## Why",
        "",
        `This change (${name}) captures a proposed mutation to the project's specs.`,
        "Describe the motivation here.",
        "",
        "## What Changes",
        "",
        "- Bullet summary of the proposed change.",
        "",
        "## Impact",
        "",
        "- Bullet summary of affected specs/files.",
        "",
      ].join("\n"),
    },
    {
      path: "design.md",
      content: [
        "## Context",
        "",
        "Describe the context and constraints.",
        "",
        "## Decisions",
        "",
        "### Decision: (title)",
        "**Decision:** ...",
        "**Why:** ...",
        "**Alternatives:** ...",
        "",
        "## Risks / Trade-offs",
        "",
        "- ...",
        "",
      ].join("\n"),
    },
    {
      path: "tasks.md",
      content: ["## Tasks", "", `- [ ] 1 First task for ${name}`, ""].join("\n"),
    },
  ];
}

// ─── 3.10 Task editor — MAX_TASK_DEPTH + deterministic numbering ────────────

/**
 * Maximum structured nesting depth for tasks. A dashboard constant (NOT a
 * schema field). Deeper nesting is preserved verbatim in Markdown (INV-2)
 * and surfaced as raw-Markdown board entries (req 03.10, req 04 §4.2 AC (a)).
 */
export const MAX_TASK_DEPTH = 3;

/**
 * Compute a task's deterministic display number from its parent chain and
 * sibling index (req 03.10 AC (a)). Numbering is derived from sidecar order
 * + parent chain and is stable across reorderings; the canonical Markdown
 * numbering is never rewritten by the dashboard (INV-2).
 *
 * `parentChain` is the ordered list of sibling indices of the task's
 * ancestors (0-based). `index` is this task's 0-based sibling index.
 *
 * Beyond MAX_TASK_DEPTH the label keeps appending segments so it remains
 * unique and deterministic (the depth-cap affects board structuring, not
 * the numbering computation itself — see req 04 §4.2 AC (a)).
 */
export function computeTaskDisplayNumber(parentChain: number[], index: number): string {
  const segments = [...parentChain, index].map((i) => i + 1);
  return segments.join(".");
}

// ─── 3.5 Artifact status tracking ──────────────────────────────────────────

export type ArtifactStatus = "done" | "ready" | "blocked" | "invalid";

export interface ArtifactStatusInput {
  /** Artifact file is present. */
  present: boolean;
  /** Artifact content (empty string when absent). */
  content: string;
  /** Artifact passes its grammar/structure validation. */
  valid: boolean;
  /** All artifacts this one depends on (schema DAG) are done. */
  depsDone: boolean;
}

/**
 * Compute a single artifact's status from the schema DAG (req 03.5):
 *   - invalid: present but structurally invalid.
 *   - blocked: deps unfinished (regardless of presence).
 *   - done:    present + non-empty + valid + deps done.
 *   - ready:   absent but deps done (can be authored now).
 *
 * Status recompute is event-driven at the route layer (AC (a)); this is the
 * pure computation invoked on each file change.
 */
export function computeArtifactStatus(input: ArtifactStatusInput): ArtifactStatus {
  if (input.present && !input.valid) return "invalid";
  if (!input.depsDone) return "blocked";
  if (input.present && input.content.trim().length > 0 && input.valid) return "done";
  // present but empty OR absent — deps done → ready.
  return "ready";
}

// ─── 3.6 Change validation ─────────────────────────────────────────────────

export interface ValidationIssue {
  level: "error" | "warning";
  artifact: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ArtifactInput {
  type: string;
  present: boolean;
  content: string;
  valid: boolean;
}

/** Required built-in artifacts for the `spec-driven` schema (req 03.3/3.6). */
export const REQUIRED_ARTIFACT_TYPES = ["proposal", "design", "tasks"] as const;

/**
 * Run an `openspec validate`-equivalent structural check on a change's
 * artifacts (req 03.6 AC (a)). Errors block archive; warnings surface but do
 * not block.
 */
export function validateChange(artifacts: ArtifactInput[]): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  for (const required of REQUIRED_ARTIFACT_TYPES) {
    const art = artifacts.find((a) => a.type === required);
    if (!art || !art.present) {
      errors.push({
        level: "error",
        artifact: required,
        message: `Required artifact "${required}" is missing.`,
      });
    } else if (!art.valid) {
      errors.push({
        level: "error",
        artifact: required,
        message: `Artifact "${required}" is present but invalid.`,
      });
    }
  }

  // Delta-spec grammar: every section heading must use a canonical verb.
  const specs = artifacts.find((a) => a.type === "specs");
  if (specs?.present) {
    const verbRe = /^##\s+([A-Z]+)\s+Requirements\b/gm;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = verbRe.exec(specs.content)) !== null) {
      const verb = m[1];
      if (!seen.has(verb)) {
        seen.add(verb);
        if (!(DELTA_VERBS as readonly string[]).includes(verb)) {
          warnings.push({
            level: "warning",
            artifact: "specs",
            message: `Unknown delta verb "${verb}" — expected one of ${DELTA_VERBS.join(", ")}.`,
          });
        }
      }
    }
    // RENAMED sections require the old name to exist in the main spec; we
    // surface that as a warning here (full enforcement is at archive time
    // when the main spec is available — req 03.9 AC (c)).
    if (/\bRENAMED\b/.test(specs.content)) {
      warnings.push({
        level: "warning",
        artifact: "specs",
        message: "RENAMED sections require the old requirement name to exist in the main spec (verified at archive).",
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Re-export the delta verbs for editor UIs. */
export { DELTA_VERBS, type DeltaVerb };
