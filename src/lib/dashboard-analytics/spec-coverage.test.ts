import { describe, it, expect } from "vitest";

/**
 * Task 7.1 — Spec coverage (req 7.4).
 *
 * Req 7.4: heatmap of spec domains × metric (requirement count, scenario
 * count, active changes touching, validation errors). AC 7.4(b): "cold spots"
 * (zero requirements) and "hot spots" (>10 active changes) are flagged.
 */
import {
  computeSpecCoverage,
  HOT_SPOT_THRESHOLD,
  type DomainCoverageInput,
} from "./spec-coverage";

function domain(
  over: Partial<DomainCoverageInput> & { domainId: string; domainName: string; projectId: string }
): DomainCoverageInput {
  return {
    requirementCount: 0,
    scenarioCount: 0,
    activeChangesTouching: 0,
    validationErrors: 0,
    ...over,
  };
}

describe("computeSpecCoverage (task 7.1, req 7.4)", () => {
  it("emits per-domain metrics including all four axes", () => {
    const result = computeSpecCoverage([
      domain({
        domainId: "d1",
        domainName: "specs",
        projectId: "p1",
        requirementCount: 3,
        scenarioCount: 7,
        activeChangesTouching: 2,
        validationErrors: 1,
      }),
    ]);
    expect(result.domains).toHaveLength(1);
    const d = result.domains[0];
    expect(d.requirementCount).toBe(3);
    expect(d.scenarioCount).toBe(7);
    expect(d.activeChangesTouching).toBe(2);
    expect(d.validationErrors).toBe(1);
  });

  it(`flags a domain with > ${HOT_SPOT_THRESHOLD} active changes as a hot spot`, () => {
    const result = computeSpecCoverage([
      domain({
        domainId: "d1",
        domainName: "hot",
        projectId: "p1",
        activeChangesTouching: HOT_SPOT_THRESHOLD + 1,
        requirementCount: 5,
      }),
    ]);
    expect(result.domains[0].flag).toBe("hot");
    expect(result.hotSpots).toBe(1);
    expect(result.coldSpots).toBe(0);
  });

  it(`treats exactly ${HOT_SPOT_THRESHOLD} active changes as NOT a hot spot`, () => {
    const result = computeSpecCoverage([
      domain({
        domainId: "d1",
        domainName: "boundary",
        projectId: "p1",
        activeChangesTouching: HOT_SPOT_THRESHOLD,
        requirementCount: 5,
      }),
    ]);
    expect(result.domains[0].flag).toBeNull();
    expect(result.hotSpots).toBe(0);
  });

  it("flags a domain with zero requirements as a cold spot", () => {
    const result = computeSpecCoverage([
      domain({
        domainId: "d1",
        domainName: "cold",
        projectId: "p1",
        requirementCount: 0,
        activeChangesTouching: 2,
      }),
    ]);
    expect(result.domains[0].flag).toBe("cold");
    expect(result.coldSpots).toBe(1);
  });

  it("provides a drill-down href to the domain's spec view per project", () => {
    const result = computeSpecCoverage([
      domain({
        domainId: "d1",
        domainName: "specs",
        projectId: "p1",
        requirementCount: 1,
      }),
    ]);
    expect(result.domains[0].href).toContain("/projects/p1/specs");
    expect(result.domains[0].href).toContain("d1");
  });
});
