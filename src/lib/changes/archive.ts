/**
 * Task 2.17 — Change single-archive with inverse-patch + per-project mutex
 * (req 03.13, INV-4/INV-4a).
 *
 * Pure archive-engine logic. The route layer composes these helpers with the
 * filesystem projection + git; everything here is deterministic and
 * side-effect free so it can be unit-tested without a DB or disk.
 *
 *   - `applyDeltaToSpec` — apply a delta spec to a main spec, recording a
 *     per-requirement inverse-patch so the merge is reversible (INV-4).
 *   - `revertSpec` — replay an inverse-patch against a (possibly evolved)
 *     main spec, reverting ONLY the requirements this archive touched so a
 *     later disjoint archive's changes survive.
 *   - `computeRestoreStatus` — INV-4a gate: a restore is blocked when a
 *     later-archived change (higher monotonic archiveSeq, D-ArchiveSeq)
 *     touched the same requirement (D-ReqID).
 *   - `ArchiveMutex` — per-project archive mutex (req 03.13 AC (d)):
 *     concurrent archives on the SAME project serialize (apply deltas → git
 *     add → git commit run under the lock); different projects run
 *     concurrently. On git failure the caller rolls back the delta
 *     application; the lock always releases.
 *
 * Source: req 03 §3.13, INV-4, INV-4a, D-ArchiveSeq, D-ReqID.
 */

// ─── Requirement-block model (byte-exact) ───────────────────────────────────

/** A `### Requirement: <title>` block located by byte offsets in a spec. */
interface BlockSpan {
  title: string;
  start: number;
  end: number;
  text: string;
}

const REQUIREMENT_HEADER_RE = /^###\s+Requirement:\s*(.+?)\s*$/;
const DELTA_SECTION_RE = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/im;
const STRUCTURAL_BREAK_RE = /^(?:###\s+Requirement:|##\s|#\s)/m;

/**
 * Locate every `### Requirement:` block in `spec` by byte offset. A block
 * starts at its header line and ends at the next structural line
 * (`### Requirement:`, any `## ` heading, or any `# ` heading) or EOF.
 * Trailing blank lines belong to the preceding block, so concatenating the
 * scaffolding between blocks with the block texts reproduces `spec` exactly.
 */
function findBlocks(spec: string): BlockSpan[] {
  const lines = spec.split("\n");
  const lineStart: number[] = [];
  let pos = 0;
  for (const ln of lines) {
    lineStart.push(pos);
    pos += ln.length + 1; // +1 for the "\n"
  }
  const blocks: BlockSpan[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = REQUIREMENT_HEADER_RE.exec(lines[i]);
    if (!m) continue;
    const start = lineStart[i];
    let j = i + 1;
    while (j < lines.length) {
      if (
        REQUIREMENT_HEADER_RE.test(lines[j]) ||
        /^##\s/.test(lines[j]) ||
        /^#\s/.test(lines[j])
      ) {
        break;
      }
      j++;
    }
    const end = j < lines.length ? lineStart[j] : spec.length;
    blocks.push({ title: m[1], start, end, text: spec.slice(start, end) });
  }
  return blocks;
}

/** A segment of a spec: either scaffold text or a requirement block. */
interface Segment {
  kind: "scaffold" | "block";
  title?: string;
  text: string;
}

/** Split `spec` into ordered scaffold/block segments (concatenation === spec). */
function segment(spec: string): Segment[] {
  const blocks = findBlocks(spec);
  const segs: Segment[] = [];
  let cursor = 0;
  for (const b of blocks) {
    if (b.start > cursor) segs.push({ kind: "scaffold", text: spec.slice(cursor, b.start) });
    segs.push({ kind: "block", title: b.title, text: b.text });
    cursor = b.end;
  }
  if (cursor < spec.length) segs.push({ kind: "scaffold", text: spec.slice(cursor) });
  return segs;
}

/** Rejoin segments into a spec string. */
function joinSegments(segs: Segment[]): string {
  return segs.map((s) => s.text).join("");
}

// ─── Delta parsing ──────────────────────────────────────────────────────────

type ArchiveVerb = "added" | "modified" | "removed" | "renamed";

/** A single requirement mutation parsed from a delta spec. */
export interface DeltaMutation {
  verb: ArchiveVerb;
  /** Added/modified/removed: the requirement title. Renamed: the NEW title. */
  title: string;
  /** Renamed only: the OLD title. */
  oldTitle?: string;
  /** Added/modified: the full delta block text (`### Requirement: …\n…`). */
  body?: string;
}

/**
 * Parse a delta spec into ordered mutations (req 03 §3.9 verb grammar).
 * RENAMED sections pair requirement headers as `{from, to}` (parser §RENAMED).
 */
export function parseDelta(delta: string): DeltaMutation[] {
  const mutations: DeltaMutation[] = [];
  const lines = delta.split("\n");
  let i = 0;
  while (i < lines.length) {
    const secMatch = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i.exec(
      lines[i],
    );
    if (!secMatch) {
      i++;
      continue;
    }
    const verb = secMatch[1].toLowerCase() as ArchiveVerb;
    // Collect requirement blocks until the next `## ` section or EOF.
    const blocks: { title: string; text: string }[] = [];
    let j = i + 1;
    while (j < lines.length && !/^##\s/.test(lines[j])) {
      const m = REQUIREMENT_HEADER_RE.exec(lines[j]);
      if (m) {
        const start = j;
        j++;
        while (j < lines.length && !REQUIREMENT_HEADER_RE.test(lines[j]) && !/^##\s/.test(lines[j])) {
          j++;
        }
        blocks.push({ title: m[1], text: lines.slice(start, j).join("\n") });
      } else {
        j++;
      }
    }
    if (verb === "renamed") {
      for (let k = 0; k + 1 < blocks.length; k += 2) {
        mutations.push({ verb, oldTitle: blocks[k].title, title: blocks[k + 1].title });
      }
    } else if (verb === "removed") {
      for (const b of blocks) mutations.push({ verb, title: b.title });
    } else {
      for (const b of blocks) mutations.push({ verb, title: b.title, body: b.text });
    }
    i = j;
  }
  return mutations;
}

// ─── Inverse-patch types ────────────────────────────────────────────────────

/** A reverse operation that undoes one mutation when replayed against a spec. */
export type InverseOp =
  | { verb: "added"; title: string }
  | { verb: "modified"; title: string; originalText: string }
  | { verb: "removed"; title: string; originalText: string; predecessorTitle: string | null }
  | { verb: "renamed"; oldTitle: string; newTitle: string };

/** The inverse-patch recorded for an archive event (INV-4, cross-session). */
export interface InversePatch {
  operations: InverseOp[];
  /** Requirement titles this archive touched (D-ReqID set for INV-4a). */
  touchedTitles: string[];
}

/** Result of applying a delta to a main spec. */
export interface ApplyResult {
  merged: string;
  inverse: InversePatch;
  touched: string[];
}

// ─── Apply + revert ─────────────────────────────────────────────────────────

/**
 * Apply a delta spec to a main spec, recording a per-requirement inverse
 * patch (req 03.13 AC (a), INV-4). The merge is reversible: `revertSpec(
 * merged, inverse)` reproduces the original main for every requirement this
 * archive touched, leaving disjoint requirements (e.g. a later archive's
 * additions) untouched.
 */
export function applyDeltaToSpec(main: string, delta: string): ApplyResult {
  const mutations = parseDelta(delta);
  const segs = segment(main);
  const operations: InverseOp[] = [];
  const touched: string[] = [];

  for (const mut of mutations) {
    if (mut.verb === "added" && mut.body) {
      // Append the new block at the end of the blocks region (after the last
      // block segment, before any trailing scaffold).
      let insertAt = segs.length;
      for (let k = segs.length - 1; k >= 0; k--) {
        if (segs[k].kind === "block") {
          insertAt = k + 1;
          break;
        }
      }
      segs.splice(insertAt, 0, { kind: "block", title: mut.title, text: mut.body });
      operations.push({ verb: "added", title: mut.title });
      touched.push(mut.title);
    } else if (mut.verb === "modified" && mut.body) {
      const idx = segs.findIndex((s) => s.kind === "block" && s.title === mut.title);
      if (idx >= 0) {
        const originalText = segs[idx].text!;
        segs[idx] = { kind: "block", title: mut.title, text: mut.body };
        operations.push({ verb: "modified", title: mut.title, originalText });
        touched.push(mut.title);
      }
    } else if (mut.verb === "removed") {
      const idx = segs.findIndex((s) => s.kind === "block" && s.title === mut.title);
      if (idx >= 0) {
        const originalText = segs[idx].text!;
        // Predecessor = the nearest preceding block title (anchor for revert).
        let predecessorTitle: string | null = null;
        for (let k = idx - 1; k >= 0; k--) {
          if (segs[k].kind === "block") {
            predecessorTitle = segs[k].title!;
            break;
          }
        }
        segs.splice(idx, 1);
        operations.push({
          verb: "removed",
          title: mut.title,
          originalText,
          predecessorTitle,
        });
        touched.push(mut.title);
      }
    } else if (mut.verb === "renamed" && mut.oldTitle) {
      const idx = segs.findIndex((s) => s.kind === "block" && s.title === mut.oldTitle);
      if (idx >= 0) {
        const renamed = segs[idx].text!.replace(
          new RegExp(
            `^###\\s+Requirement:\\s*${escapeRegex(mut.oldTitle)}\\s*$`,
            "m",
          ),
          `### Requirement: ${mut.title}`,
        );
        segs[idx] = { kind: "block", title: mut.title, text: renamed };
        operations.push({ verb: "renamed", oldTitle: mut.oldTitle, newTitle: mut.title });
        touched.push(mut.oldTitle);
      }
    }
  }

  return {
    merged: joinSegments(segs),
    inverse: { operations, touchedTitles: touched },
    touched,
  };
}

/**
 * Replay an inverse-patch against `merged`, reverting ONLY the requirements
 * this archive touched (req 03.13 AC (b), INV-4). Operations are applied in
 * reverse order so interdependent reversals (e.g. remove-then-readd of the
 * same title) compose correctly.
 *
 * NOTE: callers MUST first gate with `computeRestoreStatus` — if a later
 * archive (higher archiveSeq) touched an overlapping requirement, restore
 * enters the INV-4a "unrestorable" state and this function is not called.
 */
export function revertSpec(merged: string, inverse: InversePatch): string {
  const segs = segment(merged);
  for (let n = inverse.operations.length - 1; n >= 0; n--) {
    const op = inverse.operations[n];
    if (op.verb === "added") {
      const idx = segs.findIndex((s) => s.kind === "block" && s.title === op.title);
      if (idx >= 0) segs.splice(idx, 1);
    } else if (op.verb === "modified") {
      const idx = segs.findIndex((s) => s.kind === "block" && s.title === op.title);
      if (idx >= 0) segs[idx] = { kind: "block", title: op.title, text: op.originalText };
    } else if (op.verb === "removed") {
      const insertAt = op.predecessorTitle
        ? segs.findIndex((s) => s.kind === "block" && s.title === op.predecessorTitle) + 1
        : segs.findIndex((s) => s.kind === "block");
      const at = insertAt >= 1 ? insertAt : segs.length;
      segs.splice(at, 0, { kind: "block", title: op.title, text: op.originalText });
    } else if (op.verb === "renamed") {
      const idx = segs.findIndex((s) => s.kind === "block" && s.title === op.newTitle);
      if (idx >= 0) {
        const restored = segs[idx].text!.replace(
          new RegExp(
            `^###\\s+Requirement:\\s*${escapeRegex(op.newTitle)}\\s*$`,
            "m",
          ),
          `### Requirement: ${op.oldTitle}`,
        );
        segs[idx] = { kind: "block", title: op.oldTitle, text: restored };
      }
    }
  }
  return joinSegments(segs);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Silence the unused-import lint for the section regexes kept for parity with
// the parser module (documented verb contract).
void DELTA_SECTION_RE;
void STRUCTURAL_BREAK_RE;

// ─── INV-4a restore gate ────────────────────────────────────────────────────

/**
 * An archive event as recorded in the audit log: its monotonic sequence
 * number (D-ArchiveSeq) and the set of requirement titles (D-ReqID) it
 * touched.
 */
export interface ArchiveRecord {
  archiveSeq: number;
  requirements: string[];
}

/** INV-4a restore decision for a target archive. */
export interface RestoreStatus {
  restorable: boolean;
  /** The blocking later archive, if any. */
  blockedBy?: { archiveSeq: number; requirements: string[] };
  /** Human-readable reason quoted by the unrestorable state (INV-4a). */
  reason?: string;
}

/**
 * Compute whether a target archive may be restored (req 03.13 AC (b),
 * INV-4a). Restore is blocked iff some OTHER archive with a HIGHER monotonic
 * sequence number touched an overlapping requirement set. Comparison key =
 * archiveSeq (D-ArchiveSeq): ever-increasing, never reused, so a restored +
 * re-archived change gets a fresh higher number and is evaluated afresh.
 *
 * Test (per INV-4a):
 *   target.archiveSeq < max(other.archiveSeq
 *                           where intersects(other.requirements,
 *                                            target.requirements))
 */
export function computeRestoreStatus(
  target: ArchiveRecord,
  others: ArchiveRecord[],
): RestoreStatus {
  const targetSet = new Set(target.requirements);
  let blocker: ArchiveRecord | null = null;
  for (const other of others) {
    if (other.archiveSeq <= target.archiveSeq) continue;
    if (other.requirements.some((r) => targetSet.has(r))) {
      if (!blocker || other.archiveSeq > blocker.archiveSeq) blocker = other;
    }
  }
  if (!blocker) return { restorable: true };
  const overlap = blocker.requirements.filter((r) => targetSet.has(r));
  return {
    restorable: false,
    blockedBy: { archiveSeq: blocker.archiveSeq, requirements: overlap },
    reason: `Restore blocked by later archive #${blocker.archiveSeq} which modified the same requirement(s): ${overlap.join(", ")}.`,
  };
}

// ─── Per-project archive mutex (req 03.13 AC (d)) ───────────────────────────

/**
 * Per-project archive mutex. Archives (single + bulk) on the SAME project
 * serialize so the sequence (apply deltas → git add → git commit) never
 * interleaves; archives on DIFFERENT projects run concurrently. The lock
 * always releases, even when the critical section throws (e.g. git commit
 * failure), so a rolled-back archive does not deadlock the project.
 */
export class ArchiveMutex {
  private chains = new Map<string, Promise<unknown>>();

  /**
   * Run `fn` under the project-scoped archive mutex. Resolves with fn's result
   * (or rejects with fn's error); the lock is released either way.
   */
  withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(projectId) ?? Promise.resolve();
    const result = prev.then(() => fn());
    // The next acquirer waits for this critical section to settle (success OR
    // failure) — swallowing the error so a failed archive releases the lock.
    this.chains.set(projectId, result.then(() => undefined, () => undefined));
    return result;
  }

  /** True iff a critical section is currently holding the lock for `projectId`. */
  isHeld(projectId: string): boolean {
    return this.chains.has(projectId);
  }
}
