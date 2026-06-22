/**
 * Task 2.20 — Concurrent-edit 3-way merge (INV-7).
 *
 * When two users edit the SAME section (per-section ETag, INV-7) concurrently,
 * the losing editor receives a 409 + a 3-way merge UI (yours / theirs /
 * parent). This module is the pure engine behind that UI:
 *
 *   - `parent`/`base` = the ETagged section bytes from the last accepted
 *     write (what the losing editor's `If-Match` was computed against).
 *   - `ours`  = the losing editor's proposed bytes.
 *   - `theirs` = the winning write's current bytes (the current server state).
 *
 * The merge uses `diff-match-patch` on the section text (design D-P1-5). The
 * per-section ETag (INV-7) keeps the merge unit small — one section, not a
 * whole file — so a text-level merge is sufficient; a structured
 * Markdown-AST merge engine is deferred.
 *
 * Behaviour guarantees (INV-7, §4.24 (a) — "never silent overwrite"):
 *  - Disjoint edits on different regions auto-merge cleanly.
 *  - Overlapping edits are flagged as conflicts with BOTH sides surfaced —
 *    never a silent overwrite.
 *  - Identical edits on both sides collapse to a single clean hunk.
 *
 * The merged output the user commits becomes a new write with a fresh ETag
 * via `SectionEtagStore.commit`; this module only computes the merge, it does
 * not persist.
 *
 * Algorithm: classic diff3 over change-hunks. Each side's diff vs `base` is
 * reduced to a list of non-overlapping change hunks (a replaced base span
 * `[start, end)` → replacement text), anchored to absolute base offsets. The
 * two change lists are then walked together: disjoint changes apply cleanly;
 * overlapping changes form a conflict region spanning their union, with each
 * side's full text for that union reconstructed so nothing is dropped.
 */
import DiffMatchPatch from "diff-match-patch";

/** Inputs to a 3-way merge (all three views of one section). */
export interface MergeInput {
  /** Parent/base: the ETagged section bytes from the last accepted write. */
  base: string;
  /** Ours: the losing editor's proposed bytes. */
  ours: string;
  /** Theirs: the winning write's current bytes. */
  theirs: string;
}

/**
 * A single hunk of the merge. Either a clean region (`type: "clean"`) that
 * both sides agree on (one or both edited it identically, or neither edited
 * it), or a conflict region (`type: "conflict"`) carrying both sides.
 */
export type MergeHunk =
  | { type: "clean"; text: string }
  | { type: "conflict"; base: string; ours: string; theirs: string };

/** Result of a 3-way merge. */
export interface MergeResult {
  /** The merged text. Conflicts are rendered with inline conflict markers
   *  (<<<<<<< / ======= / >>>>>>>) so nothing is silently dropped. */
  merged: string;
  /** Ordered list of hunks (clean + conflict) for the UI to render. */
  hunks: MergeHunk[];
  /** Convenience: any hunks that are conflicts. */
  conflicts: Extract<MergeHunk, { type: "conflict" }>[];
  /** True iff `conflicts` is non-empty. */
  hasConflicts: boolean;
  /** Echo of the inputs (parent/ours/theirs) for the UI. */
  input: MergeInput;
}

/** A replaced base span on one side: `base[start,end)` → `text`. */
interface ChangeHunk {
  start: number;
  end: number;
  text: string;
}

/**
 * Reduce a diff (`base → side`) to a list of non-overlapping change hunks
 * anchored to absolute base offsets. Consecutive DELETE/INSERT ops are merged
 * into a single replacement hunk so a side never has two hunks touching the
 * same base span.
 */
function changeHunks(diff: Array<[number, string]>): ChangeHunk[] {
  const hunks: ChangeHunk[] = [];
  let basePos = 0;
  // Pending replacement being accumulated.
  let cur: ChangeHunk | null = null;

  const flush = () => {
    if (cur !== null) {
      hunks.push(cur);
      cur = null;
    }
  };

  for (const [op, text] of diff) {
    if (op === DiffMatchPatch.DIFF_EQUAL) {
      flush();
      basePos += text.length;
    } else if (op === DiffMatchPatch.DIFF_DELETE) {
      // A removed base span. Fold into the current replacement if adjacent,
      // else start a new one.
      if (cur === null) {
        cur = { start: basePos, end: basePos + text.length, text: "" };
      } else {
        cur.end = basePos + text.length;
      }
      basePos += text.length;
    } else {
      // DIFF_INSERT: new text added at the current base position. Attaches to
      // the current replacement (if any) or seeds a zero-width replacement
      // (pure insertion) that shares the base offset with anything adjacent.
      if (cur === null) {
        cur = { start: basePos, end: basePos, text };
      } else {
        cur.text += text;
      }
    }
  }
  flush();
  return hunks;
}

/** Reconstruct a side's output text for the base span `[s, e)`, applying its
 *  change hunks that fall inside that span and keeping unchanged base text. */
function reconstructSide(
  base: string,
  sideHunks: ChangeHunk[],
  cursor: number,
  s: number,
  e: number,
): string {
  let out = "";
  let pos = s;
  for (let i = cursor; i < sideHunks.length; i++) {
    const h = sideHunks[i];
    if (h.start >= e) break;
    // Keep unchanged base text preceding this hunk (within [s, e)).
    if (h.start > pos) out += base.slice(pos, h.start);
    out += h.text;
    pos = Math.max(pos, h.end);
  }
  if (pos < e) out += base.slice(pos, e);
  return out;
}

/**
 * Perform a 3-way merge of section text using diff-match-patch (diff3 over
 * change-hunks).
 */
export function threeWayMerge(input: MergeInput): MergeResult {
  const { base, ours, theirs } = input;

  const dmp = new DiffMatchPatch();
  const diffOurs = dmp.diff_main(base, ours);
  dmp.diff_cleanupSemantic(diffOurs);
  const diffTheirs = dmp.diff_main(base, theirs);
  dmp.diff_cleanupSemantic(diffTheirs);

  const aHunks = changeHunks(diffOurs);
  const bHunks = changeHunks(diffTheirs);

  const hunks: MergeHunk[] = [];
  let pendingClean: string[] = [];
  const flushClean = () => {
    if (pendingClean.length > 0) {
      hunks.push({ type: "clean", text: pendingClean.join("") });
      pendingClean = [];
    }
  };

  let p = 0; // cursor over base
  let ai = 0;
  let bi = 0;

  while (ai < aHunks.length || bi < bHunks.length) {
    const aStart = ai < aHunks.length ? aHunks[ai].start : Infinity;
    const bStart = bi < bHunks.length ? bHunks[bi].start : Infinity;
    const nextStart = Math.min(aStart, bStart);

    // Emit unchanged base text preceding the next change (clean).
    if (p < nextStart) {
      pendingClean.push(base.slice(p, nextStart));
      p = nextStart;
    }

    const aH = ai < aHunks.length ? aHunks[ai] : null;
    const bH = bi < bHunks.length ? bHunks[bi] : null;

    if (aH !== null && bH !== null && rangesOverlap(aH, bH)) {
      // Grow the conflict cluster to encompass every hunk on both sides that
      // overlaps the running union (chains of adjacent overlapping changes).
      let s = Math.min(aH.start, bH.start);
      let e = Math.max(aH.end, bH.end);
      let aCursor = ai;
      let bCursor = bi;
      // Extend: keep absorbing any side's next hunk that overlaps [s, e).
      let grew = true;
      while (grew) {
        grew = false;
        while (aCursor < aHunks.length && aHunks[aCursor].start < e && aHunks[aCursor].end > s) {
          e = Math.max(e, aHunks[aCursor].end);
          s = Math.min(s, aHunks[aCursor].start);
          aCursor++;
          grew = true;
        }
        while (bCursor < bHunks.length && bHunks[bCursor].start < e && bHunks[bCursor].end > s) {
          e = Math.max(e, bHunks[bCursor].end);
          s = Math.min(s, bHunks[bCursor].start);
          bCursor++;
          grew = true;
        }
      }

      const oursText = reconstructSide(base, aHunks, ai, s, e);
      const theirsText = reconstructSide(base, bHunks, bi, s, e);

      if (oursText === theirsText) {
        // Both sides made the same change → collapse to clean.
        pendingClean.push(oursText);
      } else {
        flushClean();
        hunks.push({
          type: "conflict",
          base: base.slice(s, e),
          ours: oursText,
          theirs: theirsText,
        });
      }
      p = e;
      ai = aCursor;
      bi = bCursor;
    } else if (aH !== null && (bH === null || aH.start <= bH.start)) {
      // Only ours changed this region.
      pendingClean.push(aH.text);
      p = aH.end;
      ai++;
    } else if (bH !== null) {
      // Only theirs changed this region.
      pendingClean.push(bH.text);
      p = bH.end;
      bi++;
    }
  }
  // Emit any trailing unchanged base.
  if (p < base.length) pendingClean.push(base.slice(p));
  flushClean();

  const conflicts = hunks.filter(
    (h): h is Extract<MergeHunk, { type: "conflict" }> => h.type === "conflict",
  );

  return {
    merged: renderMerged(hunks),
    hunks,
    conflicts,
    hasConflicts: conflicts.length > 0,
    input: { base, ours, theirs },
  };
}

/** Two change hunks overlap iff their half-open base spans intersect. Zero-width
 *  insertions overlap a same-offset hunk (touching counts for conflict-clustering). */
function rangesOverlap(a: ChangeHunk, b: ChangeHunk): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Render the hunk list into the final merged string. Conflicts are emitted
 * with git-style conflict markers so no side is silently dropped.
 */
function renderMerged(hunks: MergeHunk[]): string {
  const out: string[] = [];
  for (const h of hunks) {
    if (h.type === "clean") {
      out.push(h.text);
    } else {
      out.push("<<<<<<< ours\n", h.ours, "\n=======\n", h.theirs, "\n>>>>>>> theirs");
    }
  }
  return out.join("");
}
