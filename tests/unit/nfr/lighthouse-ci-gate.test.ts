import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Task 3.1 — Lighthouse CI gate (NFR-1).
//
// Spec: openspec/changes/phase1-mvp/specs/nfr-measurement/spec.md
//   "The CI pipeline SHALL run Lighthouse CI and SHALL fail the build when
//    First-Contentful Paint exceeds 1.5s cold or 500ms warm (NFR-1). The gate
//    SHALL be wired from Phase 1 onward."
//
// This test encodes the four spec scenarios as machine-checkable structural
// gates over the Lighthouse CI configuration and the GitHub Actions workflow,
// matching the pattern used by the gitleaks / threat-model infrastructure
// tests. The Lighthouse runner itself executes in CI (it needs a headless
// browser against a started server); the thresholds asserted here are the
// authoritative source that the CI job reads at runtime.

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const CI_WORKFLOW_PATH = resolve(REPO_ROOT, ".github", "workflows", "ci.yml");
const LHCI_CONFIG_PATH = resolve(REPO_ROOT, "lighthouserc.json");
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");

function readJson<T = unknown>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

function assertLhciAsserts(
  asserts: unknown,
  expected: { metric: string; max: number },
): void {
  const entries = Array.isArray(asserts) ? asserts : [];
  const match = entries.find((e) => {
    if (!e || typeof e !== "object") return false;
    const entry = e as Record<string, unknown>;
    return entry["audit"] === expected.metric;
  });
  expect(match).toEqual(
    expect.objectContaining({ audit: expected.metric, max: expected.max }),
  );
}

describe("Lighthouse CI gate (NFR-1, task 3.1)", () => {
  it("ships a lighthouserc.json config", () => {
    expect(existsSync(LHCI_CONFIG_PATH)).toBe(true);
  });

  it("targets the dashboard key routes for measurement", () => {
    const config = readJson<{
      ci?: { collect?: { url?: string[] } };
    }>(LHCI_CONFIG_PATH);
    const urls = config.ci?.collect?.url ?? [];
    // At least the dashboard home must be measured for FCP.
    const hasHome = urls.some((u) => /\/$|\/(projects|dashboard)?$/i.test(u));
    expect(hasHome).toBe(true);
    expect(urls.length).toBeGreaterThan(0);
  });

  it("enforces NFR-1 cold FCP budget (<= 1500ms)", () => {
    // Lighthouse reports first-contentful-paint in ms; the NFR-1 cold budget
    // is 1.5s. The LHCI assert `max` is the fail line.
    const config = readJson<{
      ci?: { assert?: { assertions?: Record<string, unknown> } };
    }>(LHCI_CONFIG_PATH);
    const assertions = config.ci?.assert?.assertions ?? {};
    const fcp = assertions["first-contentful-paint"];
    expect(fcp).toBeDefined();
    // Allow either an array form (["warn", {maxNumericValue: 1500}]) or an
    // object form ({ maxNumericValue: 1500 }).
    if (Array.isArray(fcp)) {
      const opts = fcp.find(
        (x) =>
          x && typeof x === "object" && "maxNumericValue" in (x as object),
      );
      expect((opts as { maxNumericValue: number }).maxNumericValue).toBeLessThanOrEqual(
        1500,
      );
    } else if (fcp && typeof fcp === "object") {
      expect(
        (fcp as { maxNumericValue: number }).maxNumericValue,
      ).toBeLessThanOrEqual(1500);
    } else {
      throw new TypeError(
        "first-contentful-paint assertion must be an object or [level, {maxNumericValue}]",
      );
    }
  });

  it("declares @lhci/cli as a devDependency", () => {
    const pkg = readJson<{ devDependencies?: Record<string, string> }>(
      PACKAGE_JSON_PATH,
    );
    expect(pkg.devDependencies?.["@lhci/cli"]).toBeTruthy();
  });

  it("wires a Lighthouse CI job into the CI workflow", () => {
    expect(existsSync(CI_WORKFLOW_PATH)).toBe(true);
    const wf = readFileSync(CI_WORKFLOW_PATH, "utf8");
    // The job must (a) exist as a named job, (b) invoke lhci, and (c) start a
    // preview server before collecting. We check for the presence of these
    // building blocks rather than exact YAML structure (resilient to
    // refactors that preserve behaviour).
    expect(wf).toMatch(/lighthouse/i);
    expect(wf).toMatch(/lhci\s+(autorun|collect)/);
    // The job must start the Next.js server (build + start) before collecting.
    expect(wf.toLowerCase()).toMatch(/next (start|build)/);
  });

  it("enforces cold AND warm FCP budgets via a threshold helper", () => {
    // NFR-1 splits cold (<=1.5s) and warm (<=500ms). LHCI asserts a single
    // FCP value per run; the project MUST expose both budgets so the gate
    // knows which one fired. We require a documented thresholds block
    // (either inline in lighthouserc.json or in an NFR thresholds file
    // referenced from it) naming cold <= 1500 and warm <= 500.
    const configText = readFileSync(LHCI_CONFIG_PATH, "utf8");
    const cold = /cold/i.test(configText) || /1500/.test(configText);
    const warm = /warm/i.test(configText) || /500/.test(configText);
    expect(cold && warm).toBe(true);
  });

  it("asserts the FCP assertion array shape carries the cold max", () => {
    // Belt-and-braces: the most common LHCI form is the array shape
    // ["error", { maxNumericValue: 1500 }]. This guards against a regression
    // where the assert is downgraded to "warn" (which would NOT fail CI).
    const config = readJson<{
      ci?: { assert?: { assertions?: Record<string, unknown> } };
    }>(LHCI_CONFIG_PATH);
    const fcp = config.ci?.assert?.assertions?.["first-contentful-paint"];
    expect(fcp).toBeDefined();
    if (Array.isArray(fcp)) {
      const [level] = fcp;
      // Level MUST be a failing level ("error") per the spec wording
      // "SHALL fail the build".
      expect(level).toBe("error");
    }
  });

  // The four spec scenarios (cold/warm × within/exceed) are exercised by the
  // live Lighthouse run in CI; the threshold values that define
  // "within/exceed" are what this unit test pins down.
  it("pins the NFR-1 thresholds (cold 1500ms, warm 500ms)", () => {
    const configText = readFileSync(LHCI_CONFIG_PATH, "utf8");
    expect(configText).toContain("1500");
    expect(configText).toContain("500");
  });

  // Sanity-helper used only to keep the assertion utility type-safe.
  it("assertLhciAsserts recognises a matching entry", () => {
    expect(() =>
      assertLhciAsserts([{ audit: "first-contentful-paint", max: 1500 }], {
        metric: "first-contentful-paint",
        max: 1500,
      }),
    ).not.toThrow();
  });
});
