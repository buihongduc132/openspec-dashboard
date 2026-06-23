// k6 read-latency load test — NFR-2 (single-project read p50/p99).
//
// Spec: openspec/changes/phase1-mvp/specs/nfr-measurement/spec.md
//   "The CI pipeline SHALL run a k6 load test for single-project reads and
//    SHALL fail when p50 >= 100ms or p99 >= 500ms (NFR-2)."
//
// Thresholds are sourced from k6-read-latency.config.json (the single source
// of truth shared with the structural unit test) so the live run and the unit
// gate cannot drift. Override the target host + project via env:
//   K6_BASE_URL   default http://localhost:3000
//   K6_PROJECT_ID default seed-project-1
//
// Run locally / in CI:
//   k6 run tests/load/read-latency.k6.js
//
// k6 aborts with a non-zero exit code when any threshold is breached, which
// fails the GitHub Actions job (see .github/workflows/ci.yml `k6` job).

import http from "k6/http";
import { check, group } from "k6";

const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:3000";
const PROJECT_ID = __ENV.K6_PROJECT_ID || "seed-project-1";

// --- Load the NFR-2 thresholds from the shared config (single source) -------
// k6's init context allows reading bundled files. In CI this file is passed
// with `--include-scenarios` / the working directory contains the config; for
// local k6 runs executed from the repo root, the relative path resolves.
// NOTE: k6 resolves open() relative to the SCRIPT FILE's directory
// (tests/load/), not the CWD. The config lives at repo root.
const cfg = JSON.parse(open("../../k6-read-latency.config.json"));

// --- k6 options: thresholds that FAIL the run on NFR-2 breach ---------------
// Strict '<' (k6 threshold semantics): a measured value EQUAL to the line
// still counts as within budget; because the NFR-2 spec says "SHALL fail
// when p50 >= 100ms or p99 >= 500ms", the boundary value 100/500 is the
// failure line. k6 aborts with a non-zero exit when ANY threshold is crossed,
// which fails the CI job. The literal numbers below are cross-checked against
// k6-read-latency.config.json at init so they can never silently drift.
export const options = {
  vus: cfg.load.vus,
  duration: cfg.load.duration,
  thresholds: {
    // Single-project read latency MUST stay under the NFR-2 budgets.
    http_req_duration: [
      "p(50)<100",
      "p(99)<500",
    ],
    // No failed requests: a read endpoint returning 5xx is itself a failure.
    http_req_failed: ["rate<0.01"],
  },
};

// Fail fast in CI if the config (single source of truth) and the script
// literals ever drift — defensive guard, not the primary gate.
if (cfg.thresholds.p50Ms !== 100 || cfg.thresholds.p99Ms !== 500) {
  throw new Error(
    `k6-read-latency.config.json thresholds drifted from script literals: ` +
      `p50Ms=${cfg.thresholds.p50Ms} p99Ms=${cfg.thresholds.p99Ms}`,
  );
}

// The single-project read endpoint under load (req README NFR-2 scope).
function projectReadUrl() {
  return `${BASE_URL}/api/projects/${PROJECT_ID}`;
}

export default function () {
  group("single-project read", () => {
    const res = http.get(projectReadUrl(), {
      headers: { Accept: "application/json" },
    });
    check(res, {
      "status is 2xx": (r) => r.status >= 200 && r.status < 300,
    });
  });
}

