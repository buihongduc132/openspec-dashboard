#!/usr/bin/env node
// Index-freshness probe — NFR-6 / INV-8 (search index refresh <= 2s of write).
//
// Spec: openspec/changes/phase1-mvp/specs/nfr-measurement/spec.md
//   "The CI pipeline SHALL include a probe verifying that the search index
//    refreshes within 2s of a write (NFR-6)."
//
// INV-8 (flow/requirements/README.md): "Any canonical artifact OR dashboard
//   entity ... is indexed for full-text search within its project scope
//   within 2s of write."
//
// Scenarios:
//   - "Index lags beyond 2s"     -> the probe exits non-zero (CI job fails).
//   - "Index refreshes within 2s" -> the probe exits zero (CI job passes).
//
// This probe runs in CI against a started Next.js server + seeded database
// (see .github/workflows/ci.yml `index-freshness` job). It:
//   1. Reads the NFR-6 freshness budget from index-freshness.config.json
//      (single source of truth shared with the structural unit test).
//   2. Performs a write that produces newly-searchable content.
//   3. Polls the search endpoint until the new content is findable.
//   4. Fails (non-zero exit) if the elapsed time exceeds the 2s budget.
//
// Run locally / in CI:
//   node tests/probes/index-freshness.probe.js
//
// Env overrides:
//   FRESHNESS_BASE_URL      default http://localhost:3000
//   FRESHNESS_PROJECT_ID    default seed-project-1
//   FRESHNESS_WRITE_TARGET  default /api/search/index-freshness-probe

const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = process.env.FRESHNESS_BASE_URL || "http://localhost:3000";
const PROJECT_ID = process.env.FRESHNESS_PROJECT_ID || "seed-project-1";

// --- Load the NFR-6 threshold from the shared config (single source) --------
const CONFIG_PATH = path.resolve(__dirname, "..", "..", "index-freshness.config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const FRESHNESS_MS = cfg.thresholds.freshnessMs;
const POLL_INTERVAL_MS = cfg.polling?.intervalMs ?? 100;
const POLL_DEADLINE_MS = cfg.polling?.deadlineMs ?? FRESHNESS_MS;

// Defensive guard so the config (single source of truth) and the probe
// runtime can never silently drift — the NFR-6 budget is 2000ms exactly.
if (FRESHNESS_MS !== 2000) {
  console.error(
    `[index-freshness] drift detected: index-freshness.config.json ` +
      `thresholds.freshnessMs=${FRESHNESS_MS} but NFR-6 budget is 2000ms`,
  );
  process.exit(2);
}

// A unique, searchable token written then queried for. The probe writes
// content bearing this token, then polls search until the token is found.
function makeProbeToken() {
  return `nfr6freshnessprobe${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeProbeContent(token) {
  // Issue a write that produces newly-searchable content. The dashboard
  // exposes a dedicated, idempotent probe endpoint (see targets in config)
  // that creates a short-lived searchable doc scoped to the project.
  const target = cfg.targets?.writeEndpoint || "/api/search/index-freshness-probe";
  const url = `${BASE_URL}${target}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ projectId: PROJECT_ID, token }),
  });
  if (!res.ok) {
    throw new Error(
      `[index-freshness] write failed: ${res.status} ${res.statusText} (${url})`,
    );
  }
}

async function searchReflectsWrite(token) {
  // Poll the search endpoint until the just-written content is findable.
  const searchPath = cfg.targets?.searchEndpoint || "/api/search";
  const queryParam = cfg.targets?.searchQueryParam || "q";
  const url = `${BASE_URL}${searchPath}?${queryParam}=${encodeURIComponent(token)}&projectId=${encodeURIComponent(PROJECT_ID)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `[index-freshness] search failed: ${res.status} ${res.statusText} (${url})`,
    );
  }
  const body = await res.json();
  const hits = Array.isArray(body?.hits) ? body.hits : Array.isArray(body?.results) ? body.results : [];
  return hits.some((h) => {
    const blob = typeof h === "string" ? h : JSON.stringify(h ?? "");
    return blob.toLowerCase().includes(token.toLowerCase());
  });
}

async function main() {
  const token = makeProbeToken();
  console.log(`[index-freshness] NFR-6 budget: ${FRESHNESS_MS}ms (single source of truth: index-freshness.config.json)`);
  console.log(`[index-freshness] writing probe token "${token}" to project ${PROJECT_ID}`);

  const writeStart = Date.now();
  await writeProbeContent(token);
  console.log(`[index-freshness] write accepted in ${Date.now() - writeStart}ms; polling search for refresh`);

  const deadline = writeStart + POLL_DEADLINE_MS;
  let refreshed = false;
  let elapsed = 0;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    // eslint-disable-next-line no-await-in-loop
    refreshed = await searchReflectsWrite(token);
    elapsed = Date.now() - writeStart;
    if (refreshed) break;
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_INTERVAL_MS);
  }
  elapsed = Date.now() - writeStart;

  const PROBE_FAIL_EXIT = 2;
  if (refreshed) {
    console.log(
      `[index-freshness] PASS: index refreshed in ${elapsed}ms (<= ${FRESHNESS_MS}ms, NFR-6) after ${attempts} poll(s)`,
    );
    process.exit(0);
  }

  // Scenario "Index lags beyond 2s" -> the freshness probe fails.
  console.error(
    `[index-freshness] FAIL: index did NOT refresh within ${FRESHNESS_MS}ms ` +
      `(elapsed ${elapsed}ms, ${attempts} poll(s)) — NFR-6 / INV-8 violated`,
  );
  process.exit(PROBE_FAIL_EXIT);
}

main().catch((err) => {
  console.error(`[index-freshness] ERROR: ${err?.message ?? err}`);
  process.exit(2);
});
