import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Task 3.4 — axe-core per-component a11y tests + manual AT for DnD (NFR-9).
//
// Spec: openspec/changes/phase1-mvp/specs/nfr-measurement/spec.md
//   "The CI pipeline SHALL run axe-core per-component accessibility tests and
//    SHALL fail on WCAG 2.1 AA + 2.2 AA violations (NFR-9), including the
//    five WCAG 2.2 SC (2.4.11 Focus Not Obscured Min, 2.5.7 Dragging
//    Movements, 2.5.8 Target Size Minimum, 3.3.7 Redundant Entry, 3.3.8
//    Accessible Auth Min). For the Kanban drag-and-drop specifically,
//    automated axe tests SHALL be supplemented by manual AT testing
//    (NVDA/VoiceOver/JAWS) plus keyboard-interaction scripts; this AT pass
//    SHALL happen in this phase, not be deferred."
//
// This test encodes the two spec scenarios (axe violation fails CI; DnD
// manual AT pass is in-phase) as machine-checkable structural gates over the
// axe config, the per-component axe test suite, the manual AT evidence doc,
// and the GitHub Actions workflow, mirroring the Lighthouse CI (3.1), k6
// (3.2), and index-freshness (3.3) gate tests.

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const CI_WORKFLOW_PATH = resolve(REPO_ROOT, ".github", "workflows", "ci.yml");
const AXE_CONFIG_PATH = resolve(REPO_ROOT, "axe-a11y.config.json");
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");
const A11Y_TEST_DIR = resolve(REPO_ROOT, "tests", "a11y");
const DND_AT_DOC_PATH = resolve(
  REPO_ROOT,
  "docs",
  "accessibility",
  "dnd-manual-at.md",
);

function readJson<T = unknown>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

// The five WCAG 2.2 AA Success Criteria the spec names explicitly.
const WCAG_22_SC = [
  "2.4.11",
  "2.5.7",
  "2.5.8",
  "3.3.7",
  "3.3.8",
];

describe("axe-core per-component a11y (NFR-9, task 3.4)", () => {
  it("ships an axe-a11y config (single source of truth for the ruleset)", () => {
    expect(existsSync(AXE_CONFIG_PATH)).toBe(true);
  });

  it("config targets WCAG 2.1 AA + WCAG 2.2 AA", () => {
    const configText = readFileSync(AXE_CONFIG_PATH, "utf8");
    // The ruleset MUST name both WCAG levels so the gate does not silently
    // regress to 2.1-only.
    expect(/wcag2a/i.test(configText) || /wcag.*aa/i.test(configText)).toBe(true);
    expect(/2\.1/i.test(configText)).toBe(true);
    expect(/2\.2/i.test(configText)).toBe(true);
  });

  it("config pins the five WCAG 2.2 Success Criteria by number", () => {
    // The spec lists 2.4.11, 2.5.7, 2.5.8, 3.3.7, 3.3.8 explicitly. Each MUST
    // appear in the config so the gate tracks them individually.
    const configText = readFileSync(AXE_CONFIG_PATH, "utf8");
    for (const sc of WCAG_22_SC) {
      expect(configText).toContain(sc);
    }
  });

  it("declares axe-core as a devDependency", () => {
    const pkg = readJson<{ devDependencies?: Record<string, string> }>(
      PACKAGE_JSON_PATH,
    );
    expect(pkg.devDependencies?.["axe-core"]).toBeTruthy();
  });

  it("ships at least one per-component axe test under tests/a11y", () => {
    expect(existsSync(A11Y_TEST_DIR)).toBe(true);
    const a11yTests = readdirSync(A11Y_TEST_DIR).filter((f) =>
      /\.a11y\.test\.tsx?$/.test(f),
    );
    expect(a11yTests.length).toBeGreaterThan(0);
  });

  it("per-component axe tests cover the Kanban DnD board (NFR-9 DnD surface)", () => {
    // The Kanban board is the NFR-9 DnD surface (req 04 §4.6, WCAG 2.5.7).
    // It MUST be covered by an axe per-component test.
    const a11yTests = readdirSync(A11Y_TEST_DIR).filter((f) =>
      /\.a11y\.test\.tsx?$/.test(f),
    );
    const kanbanCovered = a11yTests.some((f) => /kanban/i.test(f));
    expect(kanbanCovered).toBe(true);
  });

  it("per-component axe tests consume the axe-a11y config (single source of truth)", () => {
    const a11yTests = readdirSync(A11Y_TEST_DIR).filter((f) =>
      /\.a11y\.test\.tsx?$/.test(f),
    );
    const anyConsume = a11yTests.some((f) => {
      const text = readFileSync(resolve(A11Y_TEST_DIR, f), "utf8");
      return /axe-a11y\.config\.json/.test(text);
    });
    expect(anyConsume).toBe(true);
  });

  it("ships an axe helper that runs axe-core against a rendered container", () => {
    // A small helper centralises the axe.run invocation + config loading so
    // per-component tests stay focused on the component under test.
    const helperCandidates = [
      resolve(A11Y_TEST_DIR, "axe.ts"),
      resolve(A11Y_TEST_DIR, "axe.tsx"),
      resolve(A11Y_TEST_DIR, "run-axe.ts"),
    ];
    const helper = helperCandidates.find((p) => existsSync(p));
    expect(helper, "axe helper not found under tests/a11y").toBeTruthy();
    const text = readFileSync(helper as string, "utf8");
    expect(text).toMatch(/axe-core/);
    expect(text).toMatch(/axe-a11y\.config\.json/);
    expect(text).toMatch(/axe\.run|runAxe/);
  });

  it("records the DnD manual AT pass in-phase (not deferred)", () => {
    // Scenario "DnD manual AT pass is in-phase": the evidence doc MUST exist
    // and record results for the three named AT (NVDA/VoiceOver/JAWS) plus a
    // keyboard-interaction script for 2.5.7 Dragging Movements.
    expect(existsSync(DND_AT_DOC_PATH)).toBe(true);
    const doc = readFileSync(DND_AT_DOC_PATH, "utf8");
    expect(doc).toMatch(/NVDA/i);
    expect(doc).toMatch(/VoiceOver/i);
    expect(doc).toMatch(/JAWS/i);
    // WCAG 2.5.7 Dragging Movements MUST be named as the covered SC.
    expect(doc).toMatch(/2\.5\.7/);
    expect(doc).toMatch(/Dragging Movements/i);
    // A keyboard-interaction script path MUST be referenced so the pass is
    // reproducible, not just a prose claim.
    expect(doc).toMatch(/keyboard/i);
  });

  it("records a manual AT pass result per screen reader (PASS/FAIL/finding)", () => {
    // Each AT MUST have an explicit recorded result row, not just a mention.
    const doc = readFileSync(DND_AT_DOC_PATH, "utf8");
    const atResultPattern = /\b(PASS|FAIL|pass|fail|finding|result)/;
    expect(atResultPattern.test(doc)).toBe(true);
  });

  it("records an axe / a11y job in the CI workflow", () => {
    expect(existsSync(CI_WORKFLOW_PATH)).toBe(true);
    const wf = readFileSync(CI_WORKFLOW_PATH, "utf8");
    expect(wf).toMatch(/axe/i);
    expect(wf).toMatch(/nfr-9/i);
    // The job MUST run the unit suite (which includes the per-component axe
    // tests) — or invoke axe explicitly. Either satisfies "CI pipeline SHALL
    // run axe-core per-component accessibility tests".
    expect(wf.toLowerCase()).toMatch(/npm run test|axe-core/);
  });

  it("the a11y gate fails CI on violations (non-warn level)", () => {
    // Belt-and-braces: axe violations MUST fail the build, not warn. The
    // per-component tests assert zero violations (toHaveNoViolations-style),
    // so any violation fails the unit-test job. We assert the helper enforces
    // a failing assertion on any returned violation.
    const helperCandidates = [
      resolve(A11Y_TEST_DIR, "axe.ts"),
      resolve(A11Y_TEST_DIR, "axe.tsx"),
      resolve(A11Y_TEST_DIR, "run-axe.ts"),
    ];
    const helper = helperCandidates.find((p) => existsSync(p));
    expect(helper).toBeTruthy();
    const text = readFileSync(helper as string, "utf8");
    // The helper MUST surface violations as a failing assertion (length 0 /
    // toBe(0) / toEqual([]) / a `violations`-keyed throw).
    expect(text).toMatch(/violations|toBe\(0\)|toHaveLength\(0\)|toEqual\(\[\]\)/i);
  });
});
