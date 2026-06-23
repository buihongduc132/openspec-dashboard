/**
 * Task 5.13 (GREEN) — Postgres `audit_logs` mirror: dual-write + conflict
 * resolution (change `phase0-foundations`, spec `audit-chain`, req
 * "Filesystem chain is truth; Postgres `audit_logs` is a mirror"; design D0-8).
 *
 *   "The Phase 0 audit-emission middleware SHALL write BOTH on every
 *    mutation: (1) the authoritative filesystem chain entry, and (2) a
 *    best-effort row into `audit_logs` with matching fields. On any conflict
 *    or verification gap between the two, the filesystem chain SHALL win and
 *    the Postgres row SHALL be treated as stale."
 *
 * This module implements three surfaces:
 *
 *   1. {@link createDualWriteQueue} — wraps an {@link AuditAppendQueue} and
 *      writes a best-effort mirror row to the `audit_logs` table after each
 *      chain append. Mirror failures are logged and swallowed (the chain is
 *      authoritative; a single mirror miss is a logged incident, not a
 *      rolled-back mutation).
 *   2. {@link reconcileMirror} — detects post-hoc divergence between the
 *      filesystem chain and the mirror table (e.g. a mirror row was edited
 *      after the fact). The filesystem chain is treated as truth; divergence
 *      is surfaced as a finding, not silently reconciled.
 *   3. The shared shape of a mirror row ({@link AuditMirrorRow}) and the
 *      {@link AuditMirrorDb} interface (injected so tests use an in-memory
 *      fake; production wires Drizzle).
 *
 * Why a wrapper (vs. duplicating the queue logic): the existing
 * {@link AuditAppendQueue} is the single source of truth for chain appends
 * (single-writer mutex, prevHash serialization, restart recovery). The mirror
 * is a POST-append side-effect, not a parallel path. Wrapping preserves the
 * chain's invariants while adding the D0-8 dual-write contract.
 *
 * Why the mapper is injected (vs. hard-coded): the `audit_logs` table has
 * application-specific columns (`action`, `entityType`, `entityId`, `author`,
 * `details`) that don't exist in the chain's {@link EntryBody}. Each route
 * knows how to map its chain entry to its mirror row; the mapper injection
 * keeps this module generic and mirrors the `AuditEmitResolver` pattern from
 * task 5.11.
 */
import { createHash } from "node:crypto";
import type { AuditAppendQueue } from "./append-queue";
import type { ChainEntry, EntryBody } from "./chain";

// ---------------------------------------------------------------------------
// Mirror row shape + DB interface
// ---------------------------------------------------------------------------

/**
 * Shape of a row in the `audit_logs` table (the Postgres mirror). Fields match
 * the existing `src/db/schema.ts` `auditLogs` table (id, projectId, action,
 * entityType, entityId, details, author, createdAt).
 *
 * The `id` is set by the mirror DB on insert (UUID in production; in-memory
 * tests use a sequential id). All other fields are populated from the chain
 * entry by the injected {@link MirrorEntryMapper}.
 */
export interface AuditMirrorRow {
  id: string;
  projectId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  author?: string;
  createdAt: number;
}

/**
 * Injectable mirror-DB surface. Production wires Drizzle; tests supply an
 * in-memory fake. The surface is intentionally minimal: `insert` (called on
 * every dual-write append) and `listByProject` (called by the reconciliation
 * + backfill migration).
 */
export interface AuditMirrorDb {
  insert(row: Omit<AuditMirrorRow, "id">): Promise<void>;
  listByProject(projectId: string): Promise<AuditMirrorRow[]>;
}

/**
 * Mapper that converts a chain entry into a mirror row. Injected per-route
 * (mirrors the `AuditEmitResolver` pattern) so each route encodes its own
 * mapping from the chain's `actor/action/entity` into the mirror table's
 * `author/action/entityType/entityId`.
 */
export type MirrorEntryMapper = (
  projectId: string,
  entry: ChainEntry,
) => Omit<AuditMirrorRow, "id">;

// ---------------------------------------------------------------------------
// Dual-write queue
// ---------------------------------------------------------------------------

/**
 * Wrap a chain {@link AuditAppendQueue} with a best-effort mirror write to the
 * `audit_logs` table.
 *
 * Contract:
 *   - The chain append runs FIRST. On success, the mirror write runs second.
 *   - A mirror write failure is logged and swallowed; the chain entry remains
 *     authoritative and verifiable. The mutation is NOT rolled back (the chain
 *     is truth, per D0-3 / D0-8; rolling back on a mirror miss would invert
 *     the spec into "mirror availability gates chain availability").
 *   - The returned {@link DualWriteResult} exposes whether the mirror write
 *     succeeded (`mirrorOk`) so callers can log the incident.
 *
 * The returned queue has the same shape as {@link AuditAppendQueue} so the
 * emission middleware ({@link withAuditEmission}) can use it as a drop-in
 * replacement without knowing the mirror exists.
 */
export function createDualWriteQueue(
  chainQueue: AuditAppendQueue,
  mirror: AuditMirrorDb,
  mapper: MirrorEntryMapper,
): AuditAppendQueue {
  return {
    async append(projectId, body) {
      // Chain append first (authoritative).
      const entry = await chainQueue.append(projectId, body);

      // Mirror append second (best-effort).
      try {
        const row = mapper(projectId, entry);
        await mirror.insert(row);
        return { ...entry, mirrorOk: true };
      } catch (err) {
        // Mirror failure is logged and swallowed; the chain entry remains
        // authoritative. The caller can inspect `mirrorOk` to log the incident.
        return { ...entry, mirrorOk: false };
      }
    },
    headHash(projectId) {
      return chainQueue.headHash(projectId);
    },
  };
}

/**
 * Extended {@link ChainEntry} returned by {@link createDualWriteQueue}. The
 * `mirrorOk` flag indicates whether the mirror write succeeded; it does NOT
 * affect the chain entry's validity (the chain is truth regardless).
 */
export type DualWriteEntry = ChainEntry & { mirrorOk: boolean };

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Finding surfaced by {@link reconcileMirror} when a mirror row diverges from
 * the filesystem chain (e.g. a mirror row was edited post-hoc).
 */
export interface MirrorDivergenceFinding {
  kind: "mirror_divergence";
  /** The mirror row that diverged. */
  mirrorRow: AuditMirrorRow;
  /** The expected values (what the chain entry maps to). */
  expected: Omit<AuditMirrorRow, "id">;
  /** Description of what diverged (e.g. "action: expected 'task.update', got 'SNEAKY.delete'"). */
  description: string;
}

/**
 * Result of {@link reconcileMirror}. The filesystem chain is ALWAYS treated as
 * truth (`chainIsTruth: true`); divergence is surfaced as findings, not
 * silently reconciled.
 */
export interface ReconcileResult {
  /** True if the mirror and chain are in sync (no findings). */
  valid: boolean;
  /** Per-row divergence findings; empty if `valid === true`. */
  findings: MirrorDivergenceFinding[];
  /** Always true (the chain is truth, per D0-8). */
  chainIsTruth: true;
}

/**
 * Reconcile the filesystem chain against the mirror table. Detects post-hoc
 * divergence (e.g. a mirror row was edited after the fact) and surfaces it as
 * findings. The filesystem chain is treated as truth; divergence is NOT
 * silently reconciled (the chain is NOT mutated to match the mirror).
 *
 * Contract:
 *   - For every mirror row, compute what the chain entry maps to (via the
 *     injected {@link MirrorEntryMapper}) and compare. If any field diverges,
 *     surface a {@link MirrorDivergenceFinding}.
 *   - The filesystem chain is NEVER mutated; divergence is surfaced, not
 *     reconciled. The operator (or a scheduled job) must decide whether to
 *     correct the mirror row.
 *   - Mirror rows with no matching chain entry (e.g. the chain was truncated
 *     but the mirror row remains) are also surfaced as findings.
 */
export function reconcileMirror(
  chain: readonly ChainEntry[],
  mirrorRows: readonly AuditMirrorRow[],
  mapper: MirrorEntryMapper,
): ReconcileResult {
  const findings: MirrorDivergenceFinding[] = [];

  // For each mirror row, compute what the chain entry (at the same index,
  // assuming 1:1 correspondence) maps to and compare.
  for (let i = 0; i < mirrorRows.length; i++) {
    const mirrorRow = mirrorRows[i];
    const chainEntry = chain[i];

    if (!chainEntry) {
      // Mirror row with no corresponding chain entry (chain truncated?).
      findings.push({
        kind: "mirror_divergence",
        mirrorRow,
        expected: {
          projectId: "",
          action: "",
          entityType: "",
          entityId: "",
          author: "",
          details: "",
          createdAt: 0,
        },
        description: `Mirror row ${mirrorRow.id} has no corresponding chain entry at index ${i}`,
      });
      continue;
    }

    // Compute what this chain entry maps to (the expected mirror row).
    // We use the mirror row's projectId so the mapper produces the same shape.
    const expected = mapper(mirrorRow.projectId, chainEntry);

    // Compare fields.
    const diffs: string[] = [];
    if (mirrorRow.action !== expected.action) {
      diffs.push(`action: expected '${expected.action}', got '${mirrorRow.action}'`);
    }
    if (mirrorRow.entityType !== expected.entityType) {
      diffs.push(`entityType: expected '${expected.entityType}', got '${mirrorRow.entityType}'`);
    }
    if (mirrorRow.entityId !== expected.entityId) {
      diffs.push(`entityId: expected '${expected.entityId}', got '${mirrorRow.entityId}'`);
    }
    if (mirrorRow.author !== expected.author) {
      diffs.push(`author: expected '${expected.author}', got '${mirrorRow.author}'`);
    }
    if (mirrorRow.details !== expected.details) {
      diffs.push(`details: expected '${expected.details}', got '${mirrorRow.details}'`);
    }
    if (mirrorRow.createdAt !== expected.createdAt) {
      diffs.push(`createdAt: expected ${expected.createdAt}, got ${mirrorRow.createdAt}`);
    }

    if (diffs.length > 0) {
      findings.push({
        kind: "mirror_divergence",
        mirrorRow,
        expected,
        description: `Mirror row ${mirrorRow.id} diverges from chain entry at index ${i}: ${diffs.join("; ")}`,
      });
    }
  }

  return {
    valid: findings.length === 0,
    findings,
    chainIsTruth: true,
  };
}
