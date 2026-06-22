/**
 * Task 4.2 / req 03.15 — Change sync (no archive).
 *
 * Pure tests for the idempotent sync engine:
 *   - AC (a): re-sync detects already-applied deltas and skips them.
 *   - AC (b): manual unsync reverts the last sync batch (cross-session via
 *     persisted records, not session memory).
 */
import { describe, it, expect } from "vitest";
import {
  resync,
  unsyncLastBatch,
} from "@/lib/change-richness/sync";
import type { BulkChangeInput } from "@/lib/change-richness/types";

function change(name: string, modifies: string[]): BulkChangeInput {
  return { name, adds: [], removes: [], modifies };
}

describe("Task 4.2 / req 03.15 — Change sync (no archive)", () => {
  it("applies un-applied delta titles and records them (first sync)", () => {
    const result = resync(
      change("my-change", ["Login", "Profile"]),
      [],
      "2026-06-22T00:00:00Z",
    );
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].appliedTitles.sort()).toEqual(["Login", "Profile"]);
    expect(result.skippedTitles).toEqual([]);
  });

  it("skips already-applied deltas on re-sync (03.15 AC a)", () => {
    const prior = resync(change("my-change", ["Login"]), [], "t0");
    const result = resync(change("my-change", ["Login", "Profile"]), prior.applied, "t1");
    expect(result.skippedTitles).toEqual(["Login"]);
    expect(result.applied[0].appliedTitles).toEqual(["Profile"]);
  });

  it("unsyncLastBatch removes the highest-batch records and returns the reverted titles (03.15 AC b)", () => {
    const first = resync(change("c", ["A"]), [], "t0").applied;
    const records = [
      ...first,
      ...resync(change("c", ["B", "C"]), first, "t1").applied,
    ];
    const { remaining, reverted } = unsyncLastBatch(records);
    // last batch = B, C
    expect(reverted.sort()).toEqual(["B", "C"]);
    expect(remaining.map((r) => r.appliedTitles).flat()).toEqual(["A"]);
  });

  it("unsyncLastBatch on empty history is a no-op", () => {
    const { remaining, reverted } = unsyncLastBatch([]);
    expect(remaining).toEqual([]);
    expect(reverted).toEqual([]);
  });
});
