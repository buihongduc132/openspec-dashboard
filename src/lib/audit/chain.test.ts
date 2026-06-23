/**
 * Task 5.1 (RED) — Hash chain for per-project append-only audit log
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Append-only per-project audit log with SHA-256 hash chain").
 *
 *   hash[n] = SHA256(hash[n-1] ‖ canonical(entryBody[n]))
 *
 * entryBody schema:
 *   { actor, action, entity, beforeHash, afterHash, timestamp (UTC ms), requestId (UUID) }
 *
 * The first entry chains to a fixed genesis hash.
 */
import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  canonical,
  createChain,
  appendEntry,
  recomputeHash,
  type EntryBody,
} from "./chain";

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

describe("canonical serialization", () => {
  it("is deterministic and key-insertion-order independent", () => {
    const a = canonical(baseBody({ afterHash: "x" }));
    const shuffled = canonical({
      requestId: baseBody().requestId,
      timestamp: baseBody().timestamp,
      afterHash: "x",
      beforeHash: baseBody().beforeHash,
      entity: baseBody().entity,
      action: baseBody().action,
      actor: baseBody().actor,
    } as EntryBody);
    expect(a).toBe(shuffled);
  });
});

describe("hash chain — first entry chains to genesis", () => {
  it("anchors the first entry's prevHash to GENESIS_HASH", () => {
    const chain = createChain();
    const entry = appendEntry(chain, baseBody());
    expect(entry.prevHash).toBe(GENESIS_HASH);
    // SHA-256 hex digest.
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("recomputes the first entry's hash from genesis + canonical body", () => {
    const chain = createChain();
    const entry = appendEntry(chain, baseBody());
    expect(recomputeHash(GENESIS_HASH, entry.body)).toBe(entry.hash);
  });
});

describe("hash chain — subsequent entry chains to previous", () => {
  it("sets prevHash to the previous entry's hash", () => {
    let chain = createChain();
    const first = appendEntry(chain, baseBody({ timestamp: 1 }));
    chain = [...chain, first];
    const second = appendEntry(chain, baseBody({ timestamp: 2 }));
    expect(second.prevHash).toBe(first.hash);
  });

  it("recomputation reproduces the stored hash for any entry", () => {
    let chain = createChain();
    const first = appendEntry(chain, baseBody({ timestamp: 1 }));
    chain = [...chain, first];
    const second = appendEntry(chain, baseBody({ timestamp: 2 }));
    expect(recomputeHash(first.hash, second.body)).toBe(second.hash);
  });
});

describe("hash chain — same body, different timestamp/requestId hash distinctly", () => {
  it("two same-body entries differing only in timestamp produce distinct hashes", () => {
    const chain = createChain();
    const a = appendEntry(chain, baseBody({ timestamp: 1 }));
    const b = appendEntry(chain, baseBody({ timestamp: 2 }));
    expect(a.hash).not.toBe(b.hash);
  });

  it("two same-body entries differing only in requestId produce distinct hashes", () => {
    const chain = createChain();
    const a = appendEntry(chain, baseBody({ requestId: "a".repeat(36) }));
    const b = appendEntry(chain, baseBody({ requestId: "b".repeat(36) }));
    expect(a.hash).not.toBe(b.hash);
  });
});
