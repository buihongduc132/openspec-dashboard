/**
 * Task 4.2 / req 03.14 — Bulk archive ordering (req 03.14 AC a/b).
 *
 * Pure tests for the inter-change topological ordering engine:
 *   - AC (a): conflict detection runs across the whole selected set before
 *     any archive.
 *   - AC (b): archive order is topological w.r.t. inter-change dependencies;
 *     cycles are rejected with a clear error; topo tie-break is deterministic
 *     lexicographic on change name so the final main-spec state is
 *     reproducible regardless of selection order.
 */
import { describe, it, expect } from "vitest";
import { planBulkArchive } from "@/lib/change-richness/bulk-archive";
import type { BulkChangeInput } from "@/lib/change-richness/types";

describe("Task 4.2 / req 03.14 — Bulk archive ordering", () => {
  it("orders topologically when change A ADDS a requirement that B MODIFIES", () => {
    const a: BulkChangeInput = {
      name: "add-login",
      adds: ["Login"],
      removes: [],
      modifies: [],
    };
    const b: BulkChangeInput = {
      name: "tweak-login",
      adds: [],
      removes: [],
      modifies: ["Login"],
    };
    const plan = planBulkArchive([b, a]); // intentionally out of order
    expect(plan.conflict).toBeNull();
    expect(plan.order.indexOf("add-login")).toBeLessThan(
      plan.order.indexOf("tweak-login"),
    );
  });

  it("order is deterministic (lexicographic tie-break) regardless of input order", () => {
    const a: BulkChangeInput = {
      name: "zebra",
      adds: [],
      removes: [],
      modifies: ["X"],
    };
    const b: BulkChangeInput = {
      name: "alpha",
      adds: [],
      removes: [],
      modifies: ["Y"],
    };
    const p1 = planBulkArchive([a, b]);
    const p2 = planBulkArchive([b, a]);
    expect(p1.order).toEqual(p2.order);
    expect(p1.order).toEqual(["alpha", "zebra"]);
  });

  it("rejects a cycle in the inter-change dependency graph with a clear reason (03.14 AC b)", () => {
    // A adds R that B modifies; B adds S that A modifies → cycle.
    const a: BulkChangeInput = {
      name: "change-a",
      adds: ["R"],
      removes: [],
      modifies: ["S"],
    };
    const b: BulkChangeInput = {
      name: "change-b",
      adds: ["S"],
      removes: [],
      modifies: ["R"],
    };
    const plan = planBulkArchive([a, b]);
    expect(plan.conflict).not.toBeNull();
    expect(plan.order).toEqual([]);
    expect(plan.conflict!.cycle.length).toBeGreaterThanOrEqual(2);
    expect(plan.conflict!.reason.toLowerCase()).toContain("cycle");
  });

  it("detects direct conflicts: two changes modify the SAME requirement (03.14 AC a)", () => {
    const a: BulkChangeInput = {
      name: "first",
      adds: [],
      removes: [],
      modifies: ["Login"],
    };
    const b: BulkChangeInput = {
      name: "second",
      adds: [],
      removes: [],
      modifies: ["Login"],
    };
    const plan = planBulkArchive([a, b]);
    expect(plan.conflict).not.toBeNull();
    expect(plan.conflict!.reason.toLowerCase()).toContain("conflict");
  });
});
