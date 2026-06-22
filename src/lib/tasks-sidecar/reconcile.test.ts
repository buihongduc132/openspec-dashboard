/**
 * Task 2.19 — Deterministic reconciliation algorithm
 * (req 04 §4.21, consumed-set + lexicographic UUID tie-break).
 *
 * `reconcileTasks(markdownTuples, sidecarEntries)` is a PURE function that
 * binds Markdown `(parent-chain, prose)` tuples to sidecar UUIDs and flags
 * orphans + low-confidence advisories. It is the single spec of binding
 * (supersedes §4.1 prose).
 */
import { describe, it, expect } from "vitest";
import {
  reconcileTasks,
  LOW_CONFIDENCE_THRESHOLD,
  type ReconcileBinding,
  type ReconcileTuple,
  type ReconcileEntry,
} from "@/lib/tasks-sidecar/reconcile";

const entry = (
  uuid: string,
  parentChain: string[],
  prose: string,
): ReconcileEntry => ({ uuid, parentChain, prose });

const tuple = (
  parentChain: string[],
  prose: string,
): ReconcileTuple => ({ parentChain, prose });

describe("Task 2.19 — §4.21 reconciliation", () => {
  describe("AC (a): deterministic for a given (Markdown, sidecar) pair", () => {
    it("binds each Markdown tuple to the unique matching sidecar UUID (confidence 1.0)", () => {
      const tuples = [
        tuple(["1. Foundations"], "init repo"),
        tuple(["2. MVP"], "kanban board"),
      ];
      const sidecar = [
        entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ["2. MVP"], "kanban board"),
        entry("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ["1. Foundations"], "init repo"),
      ];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.bindings).toHaveLength(2);
      expect(out.bindings[0].uuid).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      expect(out.bindings[0].confidence).toBe(1);
      expect(out.bindings[1].uuid).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(out.bindings[1].confidence).toBe(1);
    });

    it("is idempotent: same inputs ⇒ identical bindings (deterministic)", () => {
      const tuples = [tuple([], "deploy"), tuple([], "test")];
      const sidecar = [
        entry("11111111-1111-4111-8111-111111111111", [], "deploy"),
        entry("22222222-2222-4222-8222-222222222222", [], "test"),
      ];
      const a = reconcileTasks(tuples, sidecar);
      const b = reconcileTasks(tuples, sidecar);
      expect(a).toEqual(b);
    });

    it("returns bindings in Markdown-tuple order, not sidecar order", () => {
      const tuples = [
        tuple([], "second"),
        tuple([], "first"),
      ];
      const sidecar = [
        entry("11111111-1111-4111-8111-111111111111", [], "first"),
        entry("22222222-2222-4222-8222-222222222222", [], "second"),
      ];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.bindings.map((b) => b.prose)).toEqual(["second", "first"]);
    });
  });

  describe("AC (e): duplicate-prose lines get distinct UUIDs (consumed-set)", () => {
    it("two identical prose lines never bind to the same UUID", () => {
      // Two identical Markdown tuples but only ONE matching sidecar entry.
      // The first consumes the UUID; the second MUST mint a fresh UUID.
      const tuples = [
        tuple(["X"], "deploy"),
        tuple(["X"], "deploy"),
      ];
      const sidecar = [
        entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ["X"], "deploy"),
      ];
      const out = reconcileTasks(tuples, sidecar, (i) =>
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      );
      expect(out.bindings).toHaveLength(2);
      expect(out.bindings[0].uuid).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(out.bindings[1].uuid).not.toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(out.bindings[1].fresh).toBe(true);
      // Second line is unambiguous (zero remaining matches) ⇒ confidence 1.0.
      expect(out.bindings[1].confidence).toBe(1);
    });
  });

  describe("§4.21.2: ≥2 remaining matches ⇒ lexicographic UUID tie-break", () => {
    it("ambiguous match ties by lexicographically smallest UUID", () => {
      const tuples = [tuple([], "deploy")];
      // Two sidecar entries with the SAME key.
      const sidecar = [
        entry("dddddddd-dddd-4ddd-8ddd-dddddddddddd", [], "deploy"),
        entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [], "deploy"),
        entry("cccccccc-cccc-4ccc-8ccc-cccccccccccc", [], "deploy"),
      ];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.bindings).toHaveLength(1);
      // Lexicographically smallest UUID wins.
      expect(out.bindings[0].uuid).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      // Confidence = 1/(1+matchCount) = 1/(1+3) = 0.25
      expect(out.bindings[0].confidence).toBeCloseTo(1 / 4, 5);
    });

    it("ties only consider NON-consumed sidecar entries", () => {
      // Markdown has the same tuple twice; sidecar has 2 matching entries.
      // First Markdown tuple ties the two UUIDs → picks lexicographically
      // smallest (a...). Second Markdown tuple now sees ONE remaining (d...)
      // → binds it unambiguously.
      const tuples = [
        tuple([], "deploy"),
        tuple([], "deploy"),
      ];
      const sidecar = [
        entry("dddddddd-dddd-4ddd-8ddd-dddddddddddd", [], "deploy"),
        entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [], "deploy"),
      ];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.bindings).toHaveLength(2);
      expect(out.bindings[0].uuid).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(out.bindings[1].uuid).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
      // First binding was ambiguous (2 matches) ⇒ lower confidence.
      expect(out.bindings[0].confidence).toBeCloseTo(1 / 3, 5);
      // Second binding now unambiguous (1 match) ⇒ confidence 1.0.
      expect(out.bindings[1].confidence).toBe(1);
    });
  });

  describe("§4.21.3: orphans (sidecar UUIDs never auto-deleted)", () => {
    it("flags sidecar entries with no matching Markdown tuple as orphans", () => {
      const tuples = [tuple([], "present")];
      const sidecar = [
        entry("11111111-1111-4111-8111-111111111111", [], "present"),
        entry("22222222-2222-4222-8222-222222222222", [], "gone"),
        entry("33333333-3333-4333-8333-333333333333", ["Other"], "present"),
      ];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.orphans.map((o) => o.uuid).sort()).toEqual([
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ]);
    });
  });

  describe("§4.21.4: low-confidence advisories", () => {
    it("surfices bindings below the threshold as advisories", () => {
      // 3 matching entries → confidence 0.25 < 0.5 ⇒ advisory.
      const tuples = [tuple([], "deploy")];
      const sidecar = [
        entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [], "deploy"),
        entry("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", [], "deploy"),
        entry("cccccccc-cccc-4ccc-8ccc-cccccccccccc", [], "deploy"),
      ];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.advisories).toHaveLength(1);
      expect(out.advisories[0].uuid).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(out.advisories[0].confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    });

    it("does NOT advisory a high-confidence binding", () => {
      const tuples = [tuple([], "deploy")];
      const sidecar = [entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [], "deploy")];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.advisories).toEqual([]);
    });
  });

  describe("§4.21.1 fresh-UUID assignment (zero remaining matches)", () => {
    it("assigns a fresh UUID when no sidecar entry matches", () => {
      const tuples = [tuple([], "new task")];
      const out = reconcileTasks(
        tuples,
        [],
        (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      );
      expect(out.bindings).toHaveLength(1);
      expect(out.bindings[0].uuid).toBe("00000000-0000-4000-8000-000000000001");
      expect(out.bindings[0].fresh).toBe(true);
      expect(out.bindings[0].confidence).toBe(1);
    });
  });

  describe("binding-key discrimination", () => {
    it("distinguishes identical prose under different parent chains", () => {
      const tuples = [
        tuple(["Phase A"], "deploy"),
        tuple(["Phase B"], "deploy"),
      ];
      const sidecar = [
        entry("11111111-1111-4111-8111-111111111111", ["Phase A"], "deploy"),
        entry("22222222-2222-4222-8222-222222222222", ["Phase B"], "deploy"),
      ];
      const out = reconcileTasks(tuples, sidecar);
      expect(out.bindings.map((b) => b.uuid)).toEqual([
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ]);
    });
  });

  describe("result shape is a stable, typed view", () => {
    it("exposes prose + parentChain on each binding for board rendering", () => {
      const out = reconcileTasks(
        [tuple(["X"], "deploy")],
        [entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ["X"], "deploy")],
      );
      const binding = out.bindings[0] as ReconcileBinding;
      expect(binding.prose).toBe("deploy");
      expect(binding.parentChain).toEqual(["X"]);
      expect(binding.uuid).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    });
  });
});
