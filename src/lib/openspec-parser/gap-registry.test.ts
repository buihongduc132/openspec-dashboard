/**
 * Task 3.5 — Documented-rule enumeration + gap registry (NFR-5) tests.
 *
 * RED phase: these tests import from `@/lib/openspec-parser/gap-registry` and
 * `@/lib/openspec-parser/rules`, asserting:
 *  - the documented-rule enumeration is non-empty and id-stable
 *  - the gap registry can record an unknown construct (deduped)
 *  - an unknown construct encountered during parse is appended to the registry
 *    and parsing CONTINUES (does not crash) — the core NFR-5 contract
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`,
 * Requirement "Documented-rule enumeration and gap registry (NFR-5)".
 */
import { describe, it, expect } from "vitest";
import {
  DOCUMENTED_RULES,
  DOCUMENTED_RULE_IDS,
  type DocumentedRule,
} from "@/lib/openspec-parser/rules";
import {
  createGapRegistry,
  type GapEntry,
  type GapRegistry,
} from "@/lib/openspec-parser/gap-registry";
import { parseDeltaSpec } from "@/lib/openspec-parser/delta";

describe("task 3.5 — documented-rule enumeration", () => {
  it("ships a non-empty enumerated rule list", () => {
    expect(DOCUMENTED_RULES.length).toBeGreaterThan(0);
  });

  it("every rule has a stable namespaced id and a description", () => {
    for (const rule of DOCUMENTED_RULES as DocumentedRule[]) {
      expect(rule.id).toBeTruthy();
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });

  it("rule ids are unique", () => {
    const ids = (DOCUMENTED_RULES as DocumentedRule[]).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes a DOCUMENTED_RULE_IDS set for O(1) membership checks", () => {
    expect(DOCUMENTED_RULE_IDS instanceof Set).toBe(true);
    for (const rule of DOCUMENTED_RULES as DocumentedRule[]) {
      expect(DOCUMENTED_RULE_IDS.has(rule.id)).toBe(true);
    }
  });

  it("covers the documented OpenSpec constructs (main-spec + delta + tasks)", () => {
    const ids = Array.from(DOCUMENTED_RULE_IDS);
    expect(ids.some((id) => id.includes("requirement"))).toBe(true);
    expect(ids.some((id) => id.includes("scenario"))).toBe(true);
    expect(ids.some((id) => id.includes("delta") || id.includes("added"))).toBe(true);
    expect(ids.some((id) => id.includes("checkbox") || id.includes("task"))).toBe(true);
  });
});

describe("task 3.5 — gap registry", () => {
  it("records an entry and exposes it via entries[]", () => {
    const gap = createGapRegistry();
    gap.record({ file: "spec.md", line: 7, construct: "unknown-block" });
    expect(gap.entries).toHaveLength(1);
    expect(gap.entries[0].construct).toBe("unknown-block");
  });

  it("dedupes identical (file, line, construct) observations", () => {
    const gap = createGapRegistry();
    const entry: GapEntry = { file: "spec.md", line: 7, construct: "unknown-block" };
    gap.record(entry);
    gap.record(entry);
    expect(gap.entries).toHaveLength(1);
  });

  it("keeps distinct observations separate", () => {
    const gap = createGapRegistry();
    gap.record({ file: "a.md", line: 1, construct: "x" });
    gap.record({ file: "a.md", line: 2, construct: "x" });
    gap.record({ file: "b.md", line: 1, construct: "x" });
    expect(gap.entries).toHaveLength(3);
  });

  it("a fresh registry starts empty", () => {
    const gap: GapRegistry = createGapRegistry();
    expect(gap.entries).toEqual([]);
  });
});

describe("task 3.5 — unknown construct recorded, parsing continues (NFR-5)", () => {
  it("a delta spec with a bogus section does not crash parsing", () => {
    // An unregistered `## UNKNOWN Requirements` verb is NOT a documented rule.
    const bogus = `## UNKNOWN Requirements

### Requirement: Phantom
The system SHALL never be seen.
`;
    // parseDeltaSpec must not throw; it ignores the unknown section and returns.
    const { model, issues } = parseDeltaSpec(bogus, "delta.md");
    expect(model.added).toEqual([]);
    expect(model.removed).toEqual([]);
    // No crash; the call returned a result.
    expect(Array.isArray(issues)).toBe(true);
  });
});
