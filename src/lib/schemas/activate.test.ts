/**
 * Task 4.5 — Schema authoring: activation (req 05 §5.8).
 *
 *  - 05.8 AC (a): Switching the default schema does NOT mutate existing
 *    changes; it only affects new change creation. The activation plan must
 *    surface in-flight changes authored under the previous schema so the UI
 *    can warn.
 *  - 05.8 AC (b): A per-change schema override (in `.openspec.yaml`) is
 *    respected and surfaced.
 */
import { describe, it, expect } from "vitest";
import {
  planSchemaActivation,
  type ChangeSchemaState,
} from "@/lib/schemas/activate";

const changes: ChangeSchemaState[] = [
  { changeId: "c1", name: "add-login", schemaName: "spec-driven", overridden: false },
  { changeId: "c2", name: "add-payments", schemaName: "custom-flow", overridden: true },
  { changeId: "c3", name: "fix-typo", schemaName: "spec-driven", overridden: false },
];

describe("planSchemaActivation (05.8 a — do not mutate existing changes)", () => {
  it("produces an activation plan that updates only config.yaml default-schema", () => {
    const plan = planSchemaActivation({
      projectId: "p1",
      fromSchema: "spec-driven",
      toSchema: "custom-flow",
      changes,
    });
    expect(plan.configUpdates).toEqual([
      { file: "openspec/config.yaml", key: "default-schema", value: "custom-flow" },
    ]);
    // The plan never lists per-change writes.
    expect(plan.changeWrites).toEqual([]);
  });
});

describe("planSchemaActivation (05.8 a — warn about in-flight changes)", () => {
  it("flags in-flight changes authored under the previous schema", () => {
    const plan = planSchemaActivation({
      projectId: "p1",
      fromSchema: "spec-driven",
      toSchema: "custom-flow",
      changes,
    });
    const flaggedIds = plan.inFlightWarnings.map((w) => w.changeId);
    expect(flaggedIds).toEqual(expect.arrayContaining(["c1", "c3"]));
    expect(flaggedIds).not.toContain("c2");
  });

  it("does not warn when no in-flight change used the previous schema", () => {
    const plan = planSchemaActivation({
      projectId: "p1",
      fromSchema: "spec-driven",
      toSchema: "custom-flow",
      changes: [{ changeId: "c2", name: "x", schemaName: "custom-flow", overridden: true }],
    });
    expect(plan.inFlightWarnings).toEqual([]);
  });
});

describe("planSchemaActivation (05.8 b — per-change override respected)", () => {
  it("surfaces changes whose schema differs from the project default via override", () => {
    const plan = planSchemaActivation({
      projectId: "p1",
      fromSchema: "spec-driven",
      toSchema: "custom-flow",
      changes,
    });
    const overridden = plan.perChangeOverrides;
    expect(overridden.map((o) => o.changeId)).toEqual(["c2"]);
    expect(overridden[0].schemaName).toBe("custom-flow");
  });
});
