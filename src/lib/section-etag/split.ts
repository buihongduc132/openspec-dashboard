/**
 * Task 1.9 — Section Granularity Table splitting (INV-7).
 *
 * Maps a file's raw content to the per-section byte ranges defined by the
 * Section Granularity Table in `flow/requirements/README.md`:
 *
 * | Artifact type        | Section =                              | Bytes hashed           |
 * |----------------------|----------------------------------------|------------------------|
 * | tasks.md             | one task line                          | that line's bytes only |
 * | proposal.md          | one top-level `##` heading             | that heading's body    |
 * | design.md            | one ADR / one `##` heading             | that heading's body    |
 * | delta spec .md       | one `## <VERB> Requirements` block     | that block's bytes     |
 * | main spec .md        | read-only (D-MainSpecCRUD)             | n/a (no writes)        |
 * | config.yaml/.yaml    | whole file                             | whole file             |
 *
 * Parent blocks are NEVER part of a section's bytes (the minimal-invalidation
 * rule of INV-7). Sibling sections are independent; a mutation to one never
 * changes another's ETag.
 */

/** Canonical artifact kinds enumerated by the Section Granularity Table. */
export type ArtifactKind =
  | "tasks"
  | "proposal"
  | "design"
  | "delta-spec"
  | "main-spec"
  | "whole-file";

/** A single section of an artifact file, identified by a stable key. */
export interface Section {
  /**
   * Stable identifier for this section within its file. Shape depends on the
   * artifact kind (e.g. `line:<n>` for tasks, a kebab slug for headings, the
   * verb for delta specs, `__whole__` for whole-file kinds).
   */
  key: string;
  /** The section's own bytes ONLY (no parent block, no trailing newline). */
  bytes: string;
}

const WHOLE_FILE_KEY = "__whole__";

/**
 * Split `content` into sections per the Section Granularity Table for the
 * given {@link ArtifactKind}. Main specs yield NO sections (read-only).
 */
export function splitSections(kind: ArtifactKind, content: string): Section[] {
  switch (kind) {
    case "tasks":
      return splitTasks(content);
    case "proposal":
    case "design":
      return splitHeadings(content);
    case "delta-spec":
      return splitDeltaVerbs(content);
    case "whole-file":
      return [{ key: WHOLE_FILE_KEY, bytes: content }];
    case "main-spec":
      // Read-only on main specs (D-MainSpecCRUD): no writes ⇒ no ETags.
      return [];
  }
}

/**
 * Resolve the {@link ArtifactKind} for a file path per the Section Granularity
 * Table. Falls back to `whole-file` for unknown single-writer-mutex artifacts
 * (any `.yaml`), which is the safe single-section default.
 */
export function artifactKindForPath(filePath: string): ArtifactKind {
  // Normalize to forward slashes for cross-platform determinism.
  const p = filePath.replace(/\\/g, "/");
  const base = p.split("/").pop() ?? p;

  if (base === "tasks.md") return "tasks";
  if (base === "proposal.md") return "proposal";
  if (base === "design.md") return "design";

  if (base === "spec.md") {
    // Delta specs live under changes/.../specs/; main specs under specs/.
    if (p === "changes/" || p.startsWith("changes/") || p.includes("/changes/")) {
      return "delta-spec";
    }
    return "main-spec";
  }

  if (base.endsWith(".yaml") || base.endsWith(".yml")) return "whole-file";

  // Safe default for anything else: treat as a single-writer whole file.
  return "whole-file";
}

// ─── tasks.md ────────────────────────────────────────────────────────────────

// Matches a Markdown checkbox line at any indentation: `- [ ]`, `- [x]`, `  - [X]`.
const TASK_LINE_RE = /^\s*-\s+\[(?: |x|X)\].*$/;

function splitTasks(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TASK_LINE_RE.test(line)) {
      // 1-based source line number matches the parser's `TaskItem.line`.
      sections.push({ key: `line:${i + 1}`, bytes: line });
    }
  }
  return sections;
}

// ─── proposal.md / design.md (top-level `##` headings) ───────────────────────

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Split by top-level `## ` headings. Each heading owns the body lines up to
 * the next `## ` or EOF. The heading line itself is NOT part of the section
 * bytes (only the body). Content before the first `##` heading is ignored
 * (it is not a section per the table).
 */
function splitHeadings(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentKey: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentKey !== null) {
      sections.push({ key: currentKey, bytes: currentBody.join("\n") });
    }
    currentKey = null;
    currentBody = [];
  };

  for (const line of lines) {
    // A top-level section heading. (`###` and deeper do NOT start a section.)
    const m = /^##\s+(.*)$/.exec(line);
    if (m && !line.startsWith("###")) {
      flush();
      currentKey = slugify(m[1]);
    } else if (currentKey !== null) {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}

// ─── delta spec (`## <VERB> Requirements` blocks) ────────────────────────────

const DELTA_VERB_RE = /^##\s+([A-Z]+)\s+Requirements/i;

/**
 * Split a delta spec into one section per verb block (ADDED / MODIFIED /
 * REMOVED / RENAMED). Each section's bytes span the verb heading through the
 * next verb heading or EOF, so the whole block (sub-requirements included) is
 * hashed together as one section.
 */
function splitDeltaVerbs(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentVerb: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentVerb !== null) {
      sections.push({
        key: currentVerb.toLowerCase(),
        bytes: currentBody.join("\n"),
      });
    }
    currentVerb = null;
    currentBody = [];
  };

  for (const line of lines) {
    const m = DELTA_VERB_RE.exec(line);
    if (m) {
      flush();
      currentVerb = m[1];
      currentBody.push(line);
    } else if (currentVerb !== null) {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}
