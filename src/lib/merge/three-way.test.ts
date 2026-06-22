/**
 * Task 2.20 — Concurrent-edit 3-way merge (INV-7) unit tests.
 *
 * Spec source:
 *  - `openspec/changes/build-openspec-dashboard-mvp/specs/dashboard-foundation/
 *    spec.md` Requirement "Filesystem projection with atomic writes" — the
 *    "Concurrent edits to the same section conflict" scenario: the second
 *    commit returns 409 and a 3-way merge UI is offered.
 *  - `flow/requirements/04-tasks-kanban.md` §4.24 — concurrent edits to the
 *    SAME section are rejected with a 409 and a 3-way merge UI
 *    (yours / theirs / parent) using diff-match-patch on the section text.
 *  - `openspec/changes/phase1-mvp/design.md` D-P1-5 — parent = ETagged section
 *    bytes from the last accepted write; resolution is a new write with a
 *    fresh ETag.
 *
 * Behaviour asserted here:
 *  - A clean merge (ours and theirs touch disjoint regions) auto-merges.
 *  - A conflicting merge (both sides edit the SAME region) is flagged with a
 *    conflict block (markers), never silently overwritten (INV-7).
 *  - Identical edits on both sides collapse to a single side.
 *  - The merge carries the parent / ours / theirs payloads the UI needs.
 */
import { describe, it, expect } from "vitest";
import { threeWayMerge, type MergeInput, type MergeHunk } from "@/lib/merge/three-way";

describe("threeWayMerge", () => {
  it("auto-merges disjoint edits on different regions of the section", () => {
    // Two users edit different halves of the same task line.
    const base = "- [ ] deploy the dashboard to production";
    const ours = "- [ ] deploy the dashboard to staging first"; // tail edit
    const theirs = "- [x] deploy the dashboard to production"; // head edit

    const result = threeWayMerge({ base, ours, theirs });

    expect(result.hasConflicts).toBe(false);
    // Both edits land in the merged output.
    expect(result.merged).toBe("- [x] deploy the dashboard to staging first");
  });

  it("flags a conflict and never silently overwrites when both sides edit the SAME region", () => {
    // Both users flip the status word in opposite directions.
    const base = "- [ ] deploy the dashboard to production";
    const ours = "- [ ] deploy the dashboard to staging";
    const theirs = "- [ ] deploy the dashboard to preview";

    const result = threeWayMerge({ base, ours, theirs });

    expect(result.hasConflicts).toBe(true);
    // The conflict region must surface BOTH sides, not silently pick one
    // (INV-7: "never silent overwrite").
    expect(result.merged).toContain("staging");
    expect(result.merged).toContain("preview");
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it("collapses identical edits on both sides to a single non-conflicting hunk", () => {
    const base = "- [ ] do the thing";
    const ours = "- [x] do the thing";
    const theirs = "- [x] do the thing";

    const result = threeWayMerge({ base, ours, theirs });

    expect(result.hasConflicts).toBe(false);
    expect(result.merged).toBe("- [x] do the thing");
  });

  it("returns clean merges when only one side changed", () => {
    const base = "## 1. Foundations";
    const ours = "## 1. Foundations (Phase 0)";
    const theirs = base; // theirs made no change

    const result = threeWayMerge({ base, ours, theirs });

    expect(result.hasConflicts).toBe(false);
    expect(result.merged).toBe(ours);
  });

  it("exposes the parent/ours/theirs payloads so the UI can render all three", () => {
    const input: MergeInput = { base: "base", ours: "ours", theirs: "theirs" };
    const result = threeWayMerge(input);

    expect(result.input).toEqual(input);
    // Hunk list is non-empty whenever any side differs from base.
    expect(result.hunks.length).toBeGreaterThan(0);
  });

  it("conflict hunks carry side labels (ours/theirs) for the UI", () => {
    const base = "aaa";
    const ours = "bbb";
    const theirs = "ccc";

    const result = threeWayMerge({ base, ours, theirs });

    expect(result.hasConflicts).toBe(true);
    const conflict = result.conflicts[0];
    expect(conflict).toBeDefined();
    expect((conflict as Extract<MergeHunk, { type: "conflict" }>).ours).toBe("bbb");
    expect((conflict as Extract<MergeHunk, { type: "conflict" }>).theirs).toBe("ccc");
  });
});
