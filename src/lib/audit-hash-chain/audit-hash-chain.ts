/**
 * Task 1.10 — Audit log hash-chain + chain verifier (NFR-10, D-ArchiveSeq).
 *
 * Spec source:
 *  `openspec/changes/build-openspec-dashboard-mvp/specs/dashboard-foundation/
 *  spec.md` Requirement "Audit hash-chain" (req 09 §9.6, NFR-10, plan §0.4):
 *
 *    hash[n] = SHA256(hash[n-1] ‖ canonical(entry[n]) ‖ monotonicArchiveSeq)
 *
 *  - The chain is per-project and append-only.
 *  - A chain verifier MUST detect tampering (a stored hash that no longer
 *    matches its recomputed value) or gaps (broken prevHash links / a
 *    non-monotonic or reused archiveSeq).
 *  - Archive sequence numbers are monotonic and never reused (D-ArchiveSeq).
 *
 * This module is a pure, framework-free primitive: it consumes and produces
 * plain data so it can be unit-tested without a DB and later wired into the
 * `auditLogs` table by the API layer.
 */
import { createHash } from "node:crypto";

/**
 * Fixed anchor for the first entry's `prevHash`. Any non-empty chain's
 * `chain[0].prevHash` MUST equal this value.
 */
export const GENESIS_HASH = "0".repeat(64);

/** Fixed-width big-endian buffer used to encode `archiveSeq` into the hash. */
function archiveSeqBuf(seq: number): Buffer {
  if (!Number.isInteger(seq) || seq < 0) {
    throw new RangeError(`archiveSeq must be a non-negative integer, got ${seq}`);
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(seq));
  return buf;
}

/**
 * A single state-changing operation recorded in the audit log, BEFORE it is
 * chained. This is the application-level payload; the {@link ChainedAuditEntry}
 * wrapper adds the chain fields.
 */
export interface AuditEntry {
  projectId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  author: string | null;
  createdAt: string;
}

/** An {@link AuditEntry} extended with hash-chain bookkeeping. */
export interface ChainedAuditEntry {
  auditEntry: AuditEntry;
  /** Monotonic, never-reused archive sequence (D-ArchiveSeq). */
  archiveSeq: number;
  /** Hash of the previous entry (GENESIS_HASH for the first entry). */
  prevHash: string;
  /** SHA256(prevHash ‖ canonical(auditEntry) ‖ archiveSeq). */
  hash: string;
}

/**
 * Deterministic canonical serialization of an {@link AuditEntry}.
 *
 * Keys are emitted in a fixed, sorted order so the digest is stable regardless
 * of object key insertion order, JSON source formatting, or parser quirks. The
 * output is the exact UTF-8 byte string that feeds `SHA256`.
 */
export function canonical(entry: AuditEntry): string {
  return JSON.stringify({
    action: entry.action,
    author: entry.author,
    createdAt: entry.createdAt,
    details: entry.details,
    entityId: entry.entityId,
    entityType: entry.entityType,
    projectId: entry.projectId,
  });
}

/**
 * Compute `hash[n] = SHA256(prevHash ‖ canonical(entry) ‖ archiveSeq)` per the
 * spec (req 09 §9.6). The fixed-width `archiveSeq` encoding guarantees
 * `prevHash="a"` + `seq=0` cannot collide with `prevHash="a0"` + `seq=...`.
 */
export function computeEntryHash(
  prevHash: string,
  entry: AuditEntry,
  archiveSeq: number,
): string {
  return createHash("sha256")
    .update(prevHash, "utf8")
    .update(canonical(entry), "utf8")
    .update(archiveSeqBuf(archiveSeq))
    .digest("hex");
}

/**
 * Append `entry` to `chain`, returning a NEW array (the input is not mutated).
 *
 * The appended entry's `archiveSeq` is `chain.length` (0-based, so the first
 * entry lands at seq 0) and its `prevHash` is the last entry's `hash`
 * (GENESIS_HASH for the first entry). The returned array shares the prefix
 * with `chain` (shallow copy) — callers MUST treat the result as immutable
 * thereafter for the verifier to trust its hashes.
 */
export function appendEntry(
  chain: ReadonlyArray<ChainedAuditEntry>,
  entry: AuditEntry,
): ChainedAuditEntry[] {
  const archiveSeq = chain.length;
  const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : GENESIS_HASH;
  const hash = computeEntryHash(prevHash, entry, archiveSeq);
  const next: ChainedAuditEntry = { auditEntry: entry, archiveSeq, prevHash, hash };
  return [...chain, next];
}

/** Concrete reason a verifier flagged an entry. */
export type ChainErrorReason =
  /** Stored `hash` does not equal the recomputed digest (in-place tamper). */
  | "hash-mismatch"
  /** Stored `prevHash` does not link to the previous entry (gap/reorder). */
  | "prevhash-mismatch"
  /** `archiveSeq` is non-monotonic, reused, or has a gap (D-ArchiveSeq). */
  | "archive-seq-violation";

/** One defect located by {@link verifyChain}. */
export interface ChainError {
  /** Index into the chain array of the offending entry. */
  index: number;
  reason: ChainErrorReason;
  /** Human-readable explanation, suitable for audit tooling. */
  message: string;
}

/** Result of {@link verifyChain}. */
export interface ChainVerifyResult {
  valid: boolean;
  errors: ChainError[];
}

/**
 * Verify an audit chain for tampering and gaps (NFR-10, D-ArchiveSeq).
 *
 * Checks, per entry `i`:
 *  1. `archiveSeq === i` (0-based, strictly contiguous — no gaps, no reuse).
 *  2. `prevHash === GENESIS_HASH` for `i === 0`, else `prevHash === chain[i-1].hash`.
 *  3. `hash === computeEntryHash(prevHash, auditEntry, archiveSeq)`.
 *
 * Returns `{ valid: false, errors }` if any check fails; the `errors` array
 * lists every defect found (a fully-tampered chain may surface several).
 */
export function verifyChain(chain: ReadonlyArray<ChainedAuditEntry>): ChainVerifyResult {
  const errors: ChainError[] = [];
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];

    if (e.archiveSeq !== i) {
      errors.push({
        index: i,
        reason: "archive-seq-violation",
        message: `archiveSeq ${e.archiveSeq} at index ${i} violates monotonic contiguous sequence (expected ${i})`,
      });
    }

    if (e.prevHash !== expectedPrevHash) {
      errors.push({
        index: i,
        reason: "prevhash-mismatch",
        message: `prevHash at index ${i} does not link to previous entry (expected ${expectedPrevHash.slice(0, 16)}…, got ${e.prevHash.slice(0, 16)}…)`,
      });
    }

    const recomputed = computeEntryHash(e.prevHash, e.auditEntry, e.archiveSeq);
    if (recomputed !== e.hash) {
      errors.push({
        index: i,
        reason: "hash-mismatch",
        message: `stored hash at index ${i} does not match recomputed digest (entry tampered after write)`,
      });
    }

    expectedPrevHash = e.hash;
  }

  return { valid: errors.length === 0, errors };
}
