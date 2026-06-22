import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Task 3.2 — k6 read-latency load test (NFR-2).
//
// Spec: openspec/changes/phase1-mvp/specs/nfr-measurement/spec.md
//   "The CI pipeline SHALL run a k6 load test for single-project reads and
//    SHALL fail when p50 >= 100ms or p99 >= 500ms (NFR-2). Impact-analysis
//    queries SHALL be served from cache on large projects."
//
// This test encodes the four spec scenarios (p50/p99 x within/exceed) as
// machine-checkable structural gates over the k6 thresholds config, the k6
// script, and the GitHub Actions workflow, mirroring the Lighthouse CI gate
// (task 3.1) test. The k6 runner itself executes in CI (it needs a started
// Next.js server + a seeded database); the threshold values pinned here are
// the authoritative source the CI job reads at runtime.

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const CI_WORKFLOW_PATH = resolve(REPO_ROOT, ".github", "workflows", "ci.yml");
const K6_CONFIG_PATH = resolve(REPO_ROOT, "k6-read-latency.config.json");
const K6_SCRIPT_PATH = resolve(REPO_ROOT, "tests", "load", "read-latency.k6.js");
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");

function readJson<T = unknown>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

describe("k6 read-latency load test (NFR-2, task 3.2)", () => {
  it("ships a k6 thresholds config", () => {
    expect(existsSync(K6_CONFIG_PATH)).toBe(true);
  });

  it("declares the NFR-2 p50 budget (< 100ms, fails at >= 100ms)", () => {
    const config = readJson<{
      thresholds?: { p50Ms?: number };
      nfr2?: { p50Ms?: number };
    }>(K6_CONFIG_PATH);
    const p50 = config.thresholds?.p50Ms ?? config.nfr2?.p50Ms;
    expect(p50).toBeLessThanOrEqual(100);
  });

  it("declares the NFR-2 p99 budget (< 500ms, fails at >= 500ms)", () => {
    const config = readJson<{
      thresholds?: { p99Ms?: number };
      nfr2?: { p99Ms?: number };
    }>(K6_CONFIG_PATH);
    const p99 = config.thresholds?.p99Ms ?? config.nfr2?.p99Ms;
    expect(p99).toBeLessThanOrEqual(500);
  });

  it("targets at least one single-project read endpoint", () => {
    // NFR-2 is specifically about single-project read latency (req README).
    const config = readJson<{
      targets?: { path?: string }[];
      routes?: string[];
      endpoints?: string[];
    }>(K6_CONFIG_PATH);
    const paths = [
      ...(config.targets ?? []).map((t) => t.path ?? ""),
      ...(config.routes ?? []),
      ...(config.endpoints ?? []),
    ];
    expect(paths.length).toBeGreaterThan(0);
    // Must include a project-scoped read path (e.g. /api/projects/:id or
    // /projects/:id), not only the dashboard root.
    const hasProjectRead = paths.some((p) =>
      /projects\/(:id|\$\{|{{)?/i.test(p) || /\/projects\/[^/]+/i.test(p),
    );
    expect(hasProjectRead).toBe(true);
  });

  it("ships the k6 script that consumes the thresholds config", () => {
    expect(existsSync(K6_SCRIPT_PATH)).toBe(true);
    const script = readFileSync(K6_SCRIPT_PATH, "utf8");
    // The script MUST be a k6 ES module (import from k6/http and k6).
    expect(script).toMatch(/from ['"]k6['"]/);
    expect(script).toMatch(/from ['"]k6\/http['"]/);
    // It MUST reference the thresholds config so the JSON above is the single
    // source of truth (avoids hard-coded thresholds drifting from NFR-2).
    expect(script).toMatch(/k6-read-latency\.config\.json/);
  });

  it("enforces p50 < 100ms and p99 < 500ms via k6 thresholds", () => {
    // The k6 `thresholds` block is what actually fails the CI run. The script
    // MUST emit thresholds that fail on http_req_duration at the NFR-2 lines.
    const script = readFileSync(K6_SCRIPT_PATH, "utf8");
    // p(50) must be strictly below 100ms (fail at >= 100ms per spec wording).
    expect(script).toMatch(/p\(50\)\s*<\s*100/);
    // p(99) must be strictly below 500ms.
    expect(script).toMatch(/p\(99\)\s*<\s*500/);
    // Threshold must be an "error"/aborting threshold so a breach fails CI.
    expect(script).toMatch(/http_req_duration/);
  });

  it("records a k6 job in the CI workflow", () => {
    expect(existsSync(CI_WORKFLOW_PATH)).toBe(true);
    const wf = readFileSync(CI_WORKFLOW_PATH, "utf8");
    expect(wf).toMatch(/k6/i);
    // The job must invoke `k6 run` against the read-latency script.
    expect(wf).toMatch(/k6\s+run/);
    expect(wf).toMatch(/read-latency/);
    // The job must start the Next.js server (build + start) before the load
    // run, matching the Lighthouse gate pattern.
    expect(wf.toLowerCase()).toMatch(/next (start|build)/);
  });

  it("pins the NFR-2 thresholds in the config (100ms / 500ms)", () => {
    const configText = readFileSync(K6_CONFIG_PATH, "utf8");
    expect(configText).toContain("100");
    expect(configText).toContain("500");
  });

  it("declares a k6 runner dependency or CI step (documented runner)", () => {
    // k6 is a standalone binary (not an npm package). The project MUST
    // document how k6 is provisioned — either via the grafana/k6 Docker image
    // in CI or a setup-k6 action. We assert the CI workflow provisions k6
    // explicitly rather than assuming it is pre-installed.
    const wf = readFileSync(CI_WORKFLOW_PATH, "utf8");
    const provisions = /grafana\/k6|setup-k6|grafana\/setup-k6-action|k6-io\/setup-k6/i.test(
      wf,
    );
    expect(provisions).toBe(true);
  });
});
