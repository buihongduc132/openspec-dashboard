/**
 * Task 5.5 (RED) — Tamper-detecting chain verifier
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Tamper-detecting chain verifier").
 *
 * The verifier recomputes each entry's hash from its prevHash + canonical
 * entryBody and reports the index + content of any entry whose stored hash
 * does not match the recomputed value.
 *
 * Scenarios covered (RED):
 *   - Tampered entry detected: an audit entry's `action` modified in place
 *     after being written → verifier reports the tampered entry index.
 *   - Deleted (missing) entry detected: an entry removed from the middle →
 *     verifier reports the broken link.
 *   - Clean chain passes: untouched chain → valid, no findings.
 */
import { describe, expect, it } from "vitest";
import {
  verifyChain,
  type VerificationResult,
} from "./verifier";
import { appendEntry, createChain, type ChainEntry, type EntryBody } from "./chain";

function baseBody(over: Partial<EntryBody> = {}): EntryBody {
  return {
    actor: "alice",
    action: "task.update",
    entity: "task:t-1",
    beforeHash: "deadbeef",
    afterHash: "feedface",
    timestamp: 1_718_925_200_000,
    requestId: "11111111-1111-1111-1111-111111111111",
    ...over,
  };
}

/** Build a clean, internally-consistent chain of `n` entries. */
function cleanChain(n: number): ChainEntry[] {
  let chain = createChain();
  const out: ChainEntry[] = [];
  for (let i = 0; i < n; i++) {
    const entry = appendEntry(chain, baseBody({ timestamp: 1_000 + i }));
    out.push(entry);
    chain = [...chain, entry];
  }
  return out;
}

describe("chain verifier — clean chain passes", () => {
  it("reports an untouched chain as valid with no findings", () => {
    const result = verifyChain(cleanChain(3));
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("reports an empty chain as valid (nothing to verify)", () => {
    const result = verifyChain(cleanChain(0));
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([]);
  });
});

describe("chain verifier — tampered entry detected", () => {
  it("reports the index + content of an entry whose body was modified in place", () => {
    const chain = cleanChain(3);
    // Tamper: mutate entry #1's action after it was written (stored hash stale).
    const tampered: ChainEntry = {
      ...chain[1],
      body: { ...chain[1].body, action: "task.delete" },
    };
    const mutated = [chain[0], tampered, chain[2]];

    const result: VerificationResult = verifyChain(mutated);

    expect(result.valid).toBe(false);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const finding = result.findings.find((f) => f.index === 1);
    expect(finding, "expected a finding at index 1").toBeDefined();
    expect(finding!.entry).toEqual(tampered);
  });
});

describe("chain verifier — deleted entry detected", () => {
  it("reports the broken link when an entry is removed from the middle", () => {
    const chain = cleanChain(3);
    // Delete entry #1: entry #2's prevHash no longer matches entry #0's hash.
    const deleted = [chain[0], chain[2]];

    const result: VerificationResult = verifyChain(deleted);

    expect(result.valid).toBe(false);
    // The break surfaces at the entry whose prevHash link is dangling (index 1
    // in the truncated array, the post-gap entry).
    const finding = result.findings.find((f) => f.index === 1);
    expect(finding, "expected a broken-link finding at index 1").toBeDefined();
  });
});
