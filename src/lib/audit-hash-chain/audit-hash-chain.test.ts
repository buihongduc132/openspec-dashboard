/**
 * Task 1.10 — Audit log hash-chain + chain verifier (NFR-10, D-ArchiveSeq).
 *
 * Spec source:
 *  `openspec/changes/build-openspec-dashboard-mvp/specs/dashboard-foundation/spec.md`
 *  Requirement "Audit hash-chain":
 *    hash[n] = SHA256(hash[n-1] ‖ canonical(entry[n]) ‖ monotonicArchiveSeq)
 *  - chain verifier MUST detect tampering or gaps (NFR-10)
 *  - Archive sequence numbers are monotonic and never reused (D-ArchiveSeq)
 */
import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  canonical,
  appendEntry,
  verifyChain,
  type AuditEntry,
} from "./audit-hash-chain";

function baseEntry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    projectId: "p-1",
    action: "task.update",
    entityType: "task",
    entityId: "t-1",
    details: null,
    author: "alice",
    createdAt: "2026-06-22T00:00:00.000Z",
    ...over,
  };
}

describe("canonical serialization", () => {
  it("is deterministic and stable regardless of key insertion order", () => {
    const a = canonical(baseEntry({ details: "x", author: "y" }));
    // Manually re-create the object with keys in a different order to mimic
    // JSON.parse round-trip; canonical MUST NOT depend on source key order.
    const shuffled = canonical({
      author: "y",
      createdAt: baseEntry().createdAt,
      details: "x",
      action: "task.update",
      entityType: "task",
      entityId: "t-1",
      projectId: "p-1",
    });
    expect(a).toBe(shuffled);
  });

  it("distinguishes entries that differ only in whitespace in details", () => {
    const x = canonical(baseEntry({ details: "hello world" }));
    const y = canonical(baseEntry({ details: "hello  world" }));
    expect(x).not.toBe(y);
  });
});

describe("hash-chain append", () => {
  it("seeds the first entry with GENESIS_HASH as prevHash and archiveSeq 0", () => {
    const entry = baseEntry();
    const [chained] = appendEntry([], entry);
    expect(chained.prevHash).toBe(GENESIS_HASH);
    expect(chained.archiveSeq).toBe(0);
    // hash must be a 64-char hex SHA-256.
    expect(chained.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("links subsequent entries to the previous hash and increments archiveSeq", () => {
    const entry = baseEntry();
    const [a, b] = appendEntry(
      appendEntry([], { ...entry, createdAt: "2026-06-22T00:00:01.000Z" }),
      { ...entry, createdAt: "2026-06-22T00:00:02.000Z" },
    );
    expect(b.prevHash).toBe(a.hash);
    expect(b.archiveSeq).toBe(a.archiveSeq + 1);
  });
});

describe("chain verifier (NFR-10)", () => {
  it("accepts an untampered chain", () => {
    const chain = appendEntry(
      appendEntry(appendEntry([], baseEntry()), baseEntry({ action: "spec.update" })),
      baseEntry({ action: "change.archive" }),
    );
    const result = verifyChain(chain);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects a tampered entry (modified details after write)", () => {
    const chain = appendEntry(
      appendEntry([], baseEntry({ details: "original" })),
      baseEntry(),
    );
    // Tamper with the first entry's details WITHOUT recomputing its hash.
    chain[0] = { ...chain[0], auditEntry: { ...chain[0].auditEntry, details: "TAMPERED" } };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.index === 0 && e.reason === "hash-mismatch")).toBe(true);
  });

  it("detects a broken prevHash link (gap / reordering)", () => {
    const chain = appendEntry(
      appendEntry(appendEntry([], baseEntry()), baseEntry({ action: "b" })),
      baseEntry({ action: "c" }),
    );
    // Sever the link: point entry 2 at the genesis instead of entry 1.
    chain[2] = { ...chain[2], prevHash: GENESIS_HASH };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.index === 2 && e.reason === "prevhash-mismatch")).toBe(true);
  });

  it("detects a non-monotonic or reused archiveSeq (D-ArchiveSeq)", () => {
    const chain = appendEntry(
      appendEntry(appendEntry([], baseEntry()), baseEntry({ action: "b" })),
      baseEntry({ action: "c" }),
    );
    // Reuse sequence number 1 for the third entry.
    chain[2] = { ...chain[2], archiveSeq: 1 };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.index === 2 && e.reason === "archive-seq-violation")).toBe(
      true,
    );
  });

  it("detects a missing entry (gap) when comparing archiveSeq", () => {
    const chain = appendEntry(
      appendEntry(appendEntry([], baseEntry()), baseEntry({ action: "b" })),
      baseEntry({ action: "c" }),
    );
    // Skip sequence number 1 by bumping the third entry's seq to 3.
    chain[2] = { ...chain[2], archiveSeq: 3, prevHash: chain[1].hash };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.index === 2 && e.reason === "archive-seq-violation")).toBe(
      true,
    );
  });

  it("rejects an empty genesis slot: first entry MUST anchor to GENESIS_HASH", () => {
    const chain = appendEntry([], baseEntry());
    chain[0] = { ...chain[0], prevHash: chain[0].hash };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.index === 0 && e.reason === "prevhash-mismatch")).toBe(true);
  });
});
