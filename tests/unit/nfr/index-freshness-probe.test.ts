import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Task 3.3 — Index-freshness probe (NFR-6).
//
// Spec: openspec/changes/phase1-mvp/specs/nfr-measurement/spec.md
//   "The CI pipeline SHALL include a probe verifying that the search index
//    refreshes within 2s of a write (NFR-6)."
//
// INV-8 (flow/requirements/README.md): "Any canonical artifact OR dashboard
//   entity ... is indexed for full-text search within its project scope
//   within 2s of write."
//
// This test encodes the two spec scenarios (index lags beyond 2s -> fail;
// index refreshes within 2s -> pass) as machine-checkable structural gates
// over the index-freshness thresholds config, the probe script, and the
// GitHub Actions workflow, mirroring the Lighthouse CI gate (task 3.1) and
// the k6 read-latency gate (task 3.2) tests. The probe itself executes in CI
// (it needs a started Next.js server + a seeded database to perform a write
// and then poll the search endpoint); the threshold value pinned here is the
// authoritative source the probe reads at runtime.

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const CI_WORKFLOW_PATH = resolve(REPO_ROOT, ".github", "workflows", "ci.yml");
const FRESHNESS_CONFIG_PATH = resolve(
  REPO_ROOT,
  "index-freshness.config.json",
);
const PROBE_SCRIPT_PATH = resolve(
  REPO_ROOT,
  "tests",
  "probes",
  "index-freshness.probe.js",
);

function readJson<T = unknown>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

describe("Index-freshness probe (NFR-6, task 3.3)", () => {
  it("ships an index-freshness thresholds config", () => {
    expect(existsSync(FRESHNESS_CONFIG_PATH)).toBe(true);
  });

  it("declares the NFR-6 freshness budget (<= 2000ms, fails beyond 2s)", () => {
    // NFR-6 / INV-8: search index MUST refresh within 2s of a write. The
    // config is the single source of truth the probe reads at runtime.
    const config = readJson<{
      thresholds?: { freshnessMs?: number };
      nfr6?: { freshnessMs?: number };
    }>(FRESHNESS_CONFIG_PATH);
    const freshness = config.thresholds?.freshnessMs ?? config.nfr6?.freshnessMs;
    expect(freshness).toBeDefined();
    expect(freshness).toBeLessThanOrEqual(2000);
  });

  it("pins the NFR-6 threshold literally (2000) in the config", () => {
    // Belt-and-braces: the spec wording is "within 2s" — pin the literal so a
    // drift is caught both here and by the probe's own defensive guard.
    const configText = readFileSync(FRESHNESS_CONFIG_PATH, "utf8");
    expect(configText).toContain("2000");
  });

  it("ships the probe script that consumes the thresholds config", () => {
    expect(existsSync(PROBE_SCRIPT_PATH)).toBe(true);
    const script = readFileSync(PROBE_SCRIPT_PATH, "utf8");
    // The probe MUST be a runnable Node script (shebang + process.exit).
    expect(script).toMatch(/^#!\/(usr\/)?bin\/env node/);
    // It MUST reference the thresholds config so the JSON above is the single
    // source of truth (avoids hard-coded thresholds drifting from NFR-6).
    expect(script).toMatch(/index-freshness\.config\.json/);
  });

  it("the probe performs a write then polls search for the written content", () => {
    // Scenario "Index refreshes within 2s": the probe MUST (a) perform a
    // write that produces newly-searchable content, then (b) poll the search
    // endpoint until the new content is findable. A probe that only reads
    // cannot verify freshness.
    const script = readFileSync(PROBE_SCRIPT_PATH, "utf8");
    // A write (POST/PUT/PATCH) must be issued.
    expect(script).toMatch(/(http\.post|http\.put|http\.patch|fetch\([^)]*,\s*\{[^}]*method:\s*['"](?:POST|PUT|PATCH))/i);
    // The probe must search for the just-written content (GET search).
    expect(script).toMatch(/(http\.get|fetch\()/i);
    // The probe must poll (a loop / retry) until the index reflects the write.
    expect(script).toMatch(/(while|for\s*\(|setInterval|setTimeout|retry|poll)/i);
  });

  it("the probe enforces the 2s freshness budget and fails on breach", () => {
    // Scenario "Index lags beyond 2s -> the freshness probe fails": the
    // probe MUST abort with a non-zero exit when the index has not refreshed
    // within the NFR-6 budget. The script reads the budget from the config
    // (single source of truth) and compares elapsed time against it.
    const script = readFileSync(PROBE_SCRIPT_PATH, "utf8");
    // The budget literal (2000) or a reference to the config threshold must
    // drive the polling deadline.
    expect(script).toMatch(/(2000|freshnessMs|FRESHNESS_MS|threshold)/i);
    // On breach the probe MUST exit non-zero so the CI job fails.
    expect(script).toMatch(/process\.exit\(\s*(2|1|[A-Z_]+FAIL)/);
  });

  it("records an index-freshness job in the CI workflow", () => {
    expect(existsSync(CI_WORKFLOW_PATH)).toBe(true);
    const wf = readFileSync(CI_WORKFLOW_PATH, "utf8");
    // A named job keyed to NFR-6 / index-freshness.
    expect(wf).toMatch(/index-freshness/i);
    expect(wf).toMatch(/nfr-6/i);
    // The job MUST invoke the probe script.
    expect(wf).toMatch(/index-freshness\.probe\.js/);
    // The job MUST start the Next.js server (build + start) before running
    // the probe, matching the Lighthouse/k6 gate pattern.
    expect(wf.toLowerCase()).toMatch(/next (start|build)/);
  });

  it("the probe is the authoritative runtime gate (config single source of truth)", () => {
    // Defensive: ensure the probe guards against drift between the config
    // (single source) and any literal it carries — mirrors the k6 pattern.
    const script = readFileSync(PROBE_SCRIPT_PATH, "utf8");
    expect(script).toMatch(/drift|single source of truth|FRESHNESS_MS/i);
  });
});
