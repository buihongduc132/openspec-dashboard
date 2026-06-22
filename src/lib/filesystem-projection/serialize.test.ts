/**
 * Task 1.8 — Filesystem projection serializers (Markdown projection) unit tests.
 *
 * Spec source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "Filesystem projection with
 * atomic writes"; req 01 §1.4, INV-7).
 *
 * Behaviour asserted: the projection serializes the in-memory model (produced
 * by the Task 1.7 parser) back to upstream OpenSpec Markdown such that a
 * parse → serialize → parse round-trip yields an equivalent model.
 */
import { describe, it, expect } from "vitest";
import {
  parseMainSpec,
  parseDeltaSpec,
  parseTasks,
  type TaskItem,
} from "@/lib/openspec-parser";
import {
  serializeTasks,
  serializeMainSpec,
  serializeDeltaSpec,
} from "@/lib/filesystem-projection";

/** Strip the source `line` field so round-trip comparison is structural. */
interface StrippedTask {
  marker: string;
  checked: boolean;
  label: string;
  children: StrippedTask[];
}

function withoutLine(items: TaskItem[]): StrippedTask[] {
  return items.map(({ line: _line, marker, checked, label, children }) => ({
    marker,
    checked,
    label,
    children: withoutLine(children),
  }));
}

type ReqBlock = {
  name: string;
  body: string;
  scenarios: { name: string; body: string; line: number }[];
  line: number;
};

function stripLines(reqs: ReqBlock[]) {
  return reqs.map((r) => ({
    name: r.name,
    body: r.body,
    scenarios: r.scenarios.map((s) => ({ name: s.name, body: s.body })),
  }));
}

function stripPlanLines(plan: {
  added: ReqBlock[];
  modified: ReqBlock[];
  removed: string[];
  renamed: { from: string; to: string }[];
  sectionPresence: Record<string, boolean>;
}) {
  return {
    added: stripLines(plan.added),
    modified: stripLines(plan.modified),
    removed: plan.removed,
    renamed: plan.renamed,
    sectionPresence: plan.sectionPresence,
  };
}

// ── tasks round-trip ────────────────────────────────────────────────────────

describe("serializeTasks", () => {
  it("round-trips through parseTasks (flat + nested, checked/unchecked)", () => {
    const original = [
      "## 1. Group",
      "",
      "- [x] First thing",
      "- [ ] Second thing",
      "  - [ ] Sub of second",
      "",
      "Some prose that is NOT a task.",
    ].join("\n");

    const parsed = parseTasks(original, "tasks.md");
    const projected = serializeTasks(parsed.items);
    const reparsed = parseTasks(projected, "tasks.md");

    expect(withoutLine(reparsed.items)).toEqual(withoutLine(parsed.items));
  });

  it("round-trips uppercase markers", () => {
    const original = "- [X] Uppercase marker";
    const parsed = parseTasks(original, "tasks.md");
    const projected = serializeTasks(parsed.items);
    const reparsed = parseTasks(projected, "tasks.md");
    expect(withoutLine(reparsed.items)).toEqual(withoutLine(parsed.items));
  });
});

// ── main spec round-trip ────────────────────────────────────────────────────

describe("serializeMainSpec", () => {
  it("round-trips through parseMainSpec (requirements + scenarios)", () => {
    const original = [
      "# Foo Specification",
      "",
      "## Requirements",
      "",
      "### Requirement: First",
      "The system SHALL do the first thing.",
      "",
      "#### Scenario: Happy path",
      "- **WHEN** something good happens",
      "- **THEN** everyone is happy",
      "",
      "### Requirement: Second",
      "The system SHALL do the second thing.",
    ].join("\n");

    const parsed = parseMainSpec(original, "openspec/specs/foo/spec.md");
    const projected = serializeMainSpec({
      capability: parsed.model.capability,
      requirements: parsed.model.requirements,
    });
    const reparsed = parseMainSpec(projected, "openspec/specs/foo/spec.md");

    expect(stripLines(reparsed.model.requirements)).toEqual(
      stripLines(parsed.model.requirements),
    );
    expect(reparsed.issues).toEqual([]);
  });
});

// ── delta spec round-trip ───────────────────────────────────────────────────

describe("serializeDeltaSpec", () => {
  it("round-trips through parseDeltaSpec across all verbs", () => {
    const original = [
      "## ADDED Requirements",
      "",
      "### Requirement: New Cap",
      "Body for new.",
      "",
      "## MODIFIED Requirements",
      "",
      "### Requirement: Existing Cap",
      "Body for modified.",
      "",
      "## REMOVED Requirements",
      "",
      "### Requirement: Old Cap",
      "",
      "## RENAMED Requirements",
      "",
      "### Requirement: From Name",
      "to",
      "### Requirement: To Name",
      "",
    ].join("\n");

    const parsed = parseDeltaSpec(original, "specs/x/spec.md");
    const projected = serializeDeltaSpec(parsed.plan);
    const reparsed = parseDeltaSpec(projected, "specs/x/spec.md");

    expect(stripPlanLines(reparsed.plan)).toEqual(stripPlanLines(parsed.plan));
  });
});
