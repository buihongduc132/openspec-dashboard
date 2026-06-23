/**
 * Task 7.3 (§0.6) — CI gitleaks gate covers history AND working tree on PRs.
 *
 * Spec source: `secret-hygiene-gate` —
 * "Pre-commit, pre-push, and CI gitleaks gates wired":
 *   Scenario "CI gate runs on every PR": WHEN a PR is opened THEN the CI
 *   gitleaks job runs over history + working tree and is a required check.
 * And "Secret scan covers working tree and history": the scan SHALL cover the
 * git history (all refs) AND the working tree.
 *
 * The "required check" part is a GitHub branch-protection setting (no in-repo
 * representation) and is owned as a manual ops step; these tests pin the
 * in-repo, testable parts of the CI gate:
 *   1. the `secret-scan` job triggers on `pull_request`,
 *   2. it fetches FULL history (`fetch-depth: 0`) so secrets already in
 *      commits are visible, and
 *   3. it runs an EXPLICIT working-tree gitleaks pass in addition to the
 *      commit-history pass, so the spec's "history + working tree" is literal.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function repoRoot(): string {
  return resolve(__dirname, "..", "..", "..");
}

/** Extract the body of the `secret-scan` job from the CI workflow YAML. */
function secretScanJob(): string {
  const ci = readFileSync(join(repoRoot(), ".github", "workflows", "ci.yml"), "utf8");
  const start = ci.indexOf("secret-scan:");
  expect(start, "secret-scan job must exist in ci.yml").toBeGreaterThan(-1);
  // The job ends at the next top-level job key (two-space indent + name + colon
  // at the start of a line, after the secret-scan block).
  const after = ci.slice(start + "secret-scan:".length);
  const nextJobMatch = after.match(/\n  [a-z][a-z0-9-]*:/);
  const end = nextJobMatch?.index ?? after.length;
  return ci.slice(start, start + "secret-scan:".length + end);
}

describe("CI gitleaks gate — history + working tree on PRs (Task 7.3)", () => {
  it("the secret-scan job triggers on pull_request", () => {
    const ci = readFileSync(join(repoRoot(), ".github", "workflows", "ci.yml"), "utf8");
    // `on:` trigger block must list pull_request (the whole file, since the
    // trigger is at the top, not inside the job).
    expect(ci).toMatch(/on:[\s\S]*?pull_request/);
  });

  it("checks out with fetch-depth: 0 so full history is scannable", () => {
    const job = secretScanJob();
    expect(job, "secret-scan must fetch full history (fetch-depth: 0)").toMatch(
      /fetch-depth:\s*0/,
    );
  });

  it("runs an EXPLICIT working-tree gitleaks pass (history + working tree)", () => {
    const job = secretScanJob();
    // The history pass is the gitleaks-action step. The working-tree pass must
    // be a DISTINCT scan STEP (a `- name:` + `run:`/`uses:` pair) that scans
    // the current checkout without relying on commit history (gitleaks `dir`
    // or `detect --no-git --source .`). A comment mention does NOT count — we
    // look for an actual step whose name advertises working-tree coverage.
    const stepLines = job.split("\n").filter((l) => /^\s*-\s*(name|uses|run):/i.test(l));
    const hasWorkingTreeStep = stepLines.some((l) => /working[ -]?tree/i.test(l));
    expect(hasWorkingTreeStep, "secret-scan must have a named working-tree scan step").toBe(true);
  });
});
