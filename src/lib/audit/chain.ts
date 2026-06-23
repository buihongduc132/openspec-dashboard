/**
 * Task 5.2 (GREEN) — Per-project append-only audit log hash chain.
 *
 * Spec source:
 *   `openspec/changes/phase0-foundations/specs/audit-chain/spec.md`,
 *   Requirement "Append-only per-project audit log with SHA-256 hash chain".
 *
 *     hash[n] = SHA256(hash[n-1] ‖ canonical(entryBody[n]))
 *
 * The first entry chains to a fixed genesis hash. The `entryBody` schema is
 *   { actor, action, entity, beforeHash, afterHash, timestamp (UTC ms), requestId (UUID) }.
 *
 * This module is a pure, framework-free primitive: it consumes and produces
 * plain data so it can be unit-tested without a filesystem and later wired
 * into the per-project audit file by the append-queue (task 5.4).
 *
 * NOTE: A legacy `src/lib/audit-hash-chain/` exists from the prior
 * `build-openspec-dashboard-mvp` change (it folds an `archiveSeq` into the
 * hash and uses a different entry shape). This Phase-0 `audit/chain.ts`
 * module implements the `audit-chain` spec verbatim (entryBody schema above,
 * NO archiveSeq in the hash) and is the authoritative chain primitive for
 * Phase 0 onward (D0-3, D-Audit).
 */
import { createHash } from "node:crypto";

/**
 * Fixed anchor for the first entry's `prevHash`. Any non-empty chain's first
 * entry MUST chain to this value. All-zero 64-hex so a real SHA-256 digest
 * can never collide with it.
 */
export const GENESIS_HASH = "0".repeat(64);

/**
 * The application-level payload of one audit entry, BEFORE chaining.
 * Exactly the schema named in the spec.
 */
export interface EntryBody {
  /** Who performed the mutation (user id / agent id / "system"). */
  actor: string;
  /** What kind of mutation (e.g. "task.update", "spec.create"). */
  action: string;
  /** Stable identifier of the affected canonical artifact (e.g. "task:t-1"). */
  entity: string;
  /** Content hash of the artifact before the mutation (or sentinel for creates). */
  beforeHash: string;
  /** Content hash of the artifact after the mutation (or sentinel for deletes). */
  afterHash: string;
  /** UTC epoch milliseconds at which the mutation was applied. */
  timestamp: number;
  /** Correlation UUID for the mutating request. */
  requestId: string;
}

/** A chained audit entry: an {@link EntryBody} plus hash-chain bookkeeping. */
export interface ChainEntry {
  /** Canonical application payload. */
  body: EntryBody;
  /** Hash of the previous entry (GENESIS_HASH for the first entry). */
  prevHash: string;
  /** SHA256(prevHash ‖ canonical(body)). */
  hash: string;
}

/**
 * Deterministic canonical serialization of an {@link EntryBody}.
 *
 * Fields are emitted in a fixed alphabetical order so the digest is stable
 * regardless of object key insertion order or source formatting. The output
 * is the exact UTF-8 byte string that feeds `SHA256`. This is what makes
 * "two same-body entries at different times remain distinct" provable: the
 * timestamp and requestId participate in the canonical form and therefore in
 * the digest.
 */
export function canonical(body: EntryBody): string {
  return JSON.stringify({
    action: body.action,
    actor: body.actor,
    afterHash: body.afterHash,
    beforeHash: body.beforeHash,
    entity: body.entity,
    requestId: body.requestId,
    timestamp: body.timestamp,
  });
}

/**
 * Recompute `SHA256(prevHash ‖ canonical(body))` per the spec.
 *
 * This is the pure chaining function; it does not touch the chain array, so
 * the verifier (task 5.6) reuses it to detect tampering.
 */
export function recomputeHash(prevHash: string, body: EntryBody): string {
  return createHash("sha256")
    .update(prevHash, "utf8")
    .update(canonical(body), "utf8")
    .digest("hex");
}

/**
 * Create an empty (genesis-anchored) chain. The head hash of an empty chain
 * is the genesis hash; the first appended entry chains to it.
 */
export function createChain(): ChainEntry[] {
  return [];
}

/**
 * Append `body` to `chain`, returning a NEW {@link ChainEntry} and leaving
 * the caller responsible for extending the chain array (append-only).
 *
 * The new entry's `prevHash` is the last entry's `hash` (GENESIS_HASH for the
 * first entry), so two appends never read the same `prevHash` when serialized
 * by the append-queue (task 5.4).
 */
export function appendEntry(
  chain: ReadonlyArray<ChainEntry>,
  body: EntryBody,
): ChainEntry {
  const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : GENESIS_HASH;
  const hash = recomputeHash(prevHash, body);
  return { body, prevHash, hash };
}
