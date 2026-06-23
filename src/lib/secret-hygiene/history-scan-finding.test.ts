/**
 * Task 7.4 (§0.6) — one-time all-refs history scan finding.
 *
 * Spec source: `secret-hygiene-gate` —
 * "Initial-pushed-history scan is a Phase 0 prerequisite":
 *   a one-time gitleaks scan of the already-pushed refs (`e8a516f`,
 *   `39cb79b`, ALL refs) SHALL be performed as a Phase 0 prerequisite.
 *   The outcome is binary: clean → proceed / dirty → rewrite + force-update.
 *
 * The earlier finding (`2026-06-22_initial-push-history-scan.md`) covered only
 * the two initial-push commits. This task demands the scan cover ALL refs
 * (every pushed branch + remote). These tests pin that a finding exists which:
 *   1. explicitly covers all refs (not just the two seed commits),
 *   2. records a binary outcome (clean/dirty), and
 *   3. references the seed commits `e8a516f` + `39cb79b`.
 *
 * The scan itself is operational (run once, recorded); these tests verify the
 * recorded artifact is complete and faithful so the gate cannot silently
 * regress to "only the first two commits were checked".
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function repoRoot(): string {
  return resolve(__dirname, "..", "..", "..");
}

function findingsDir(): string {
  return join(repoRoot(), "flow", "findings");
}

/** Concatenate every finding file that relates to history/secret scanning. */
function historyScanFindings(): Array<{ name: string; text: string }> {
  return readdirSync(findingsDir())
    .filter((f) => /histor|secret|gitleak|push/i.test(f))
    .map((name) => ({ name, text: readFileSync(join(findingsDir(), name), "utf8") }));
}

describe("one-time all-refs history scan finding (Task 7.4)", () => {
  it("at least one history/secret-scan finding exists", () => {
    expect(historyScanFindings().length, "flow/findings/ should have a history-scan finding").toBeGreaterThan(0);
  });

  it("a finding explicitly covers ALL refs (not only the two seed commits)", () => {
    const findings = historyScanFindings();
    const coversAllRefs = findings.some((f) =>
      // Must advertise all-refs coverage AND a non-trivial commit count / ref
      // enumeration, so a finding that only mentions e8a516f+39cb79b does not
      // satisfy "all refs".
      /all[- ]?refs/i.test(f.text) &&
      /(for-each-ref|every ref|all (pushed )?(branches|refs)|[0-9]+ commits scanned)/i.test(f.text),
    );
    expect(coversAllRefs, "a finding must explicitly cover all refs").toBe(true);
  });

  it("a finding records a binary outcome (clean or dirty)", () => {
    const findings = historyScanFindings();
    const hasBinaryOutcome = findings.some((f) =>
      // Outcome line: e.g. "Result: PASS — no secrets" or "outcome: clean".
      /(result|outcome)\s*[:=]?\s*(clean|pass|dirty|fail)/i.test(f.text),
    );
    expect(hasBinaryOutcome, "a finding must record a binary clean/dirty outcome").toBe(true);
  });

  it("a finding references the seed commits e8a516f and 39cb79b", () => {
    const findings = historyScanFindings();
    const refsSeeds = findings.some(
      (f) => /e8a516f/i.test(f.text) && /39cb79b/i.test(f.text),
    );
    expect(refsSeeds, "a finding must reference e8a516f and 39cb79b").toBe(true);
  });

  it("if any finding records a DIRTY outcome, it mandates the rewrite+rotate path", () => {
    // The gate's "dirty" branch MUST be documented; if the recorded outcome is
    // dirty anywhere, the finding must own the rewrite + force-update + rotate
    // remediation. (Current Phase 0 outcome is clean, so this is a guard.)
    const findings = historyScanFindings();
    for (const f of findings) {
      if (/(result|outcome)\s*[:=]?\s*(dirty|fail)/i.test(f.text)) {
        expect(f.text, "dirty finding must mandate rewrite + force-update + rotate").toMatch(
          /(rewrite|force-(push|update)|rotat)/i,
        );
      }
    }
  });
});
