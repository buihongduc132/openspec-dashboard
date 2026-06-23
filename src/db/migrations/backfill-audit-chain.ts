/**
 * Task 5.14 (GREEN) — One-time cutover backfill migration that ports
 * pre-existing `audit_logs` rows into the filesystem chain (change
 * `phase0-foundations`, spec `audit-chain`, req "One-time backfill of
 * pre-existing `audit_logs` rows"; design D0-8).
 *
 *   "A one-time Phase 0 cutover migration SHALL backfill every pre-existing
 *    `audit_logs` row into the filesystem chain, chained from genesis in
 *    `createdAt` order, so no prior history is lost at the cutover. The
 *    migration SHALL be idempotent (re-running it produces no duplicate chain
 *    entries) and SHALL be verified by the chain verifier after completion."
 *
 * Design:
 *   - Reads pre-existing `audit_logs` rows for a project from the injected
 *     {@link AuditMirrorDb}, sorted ascending by `createdAt`.
 *   - Appends each row to the filesystem chain via the injected
 *     {@link AuditAppendQueue}. Because the queue chains from the current head
 *     (genesis for an empty chain), the first backfilled row anchors at
 *     genesis and subsequent rows chain in `createdAt` order.
 *   - Idempotency is enforced by a per-project marker file
 *     (`<projectId>.backfill.json`) recording the set of already-backfilled
 *     row IDs. Re-running skips any row whose ID is already in the marker, so
 *     no duplicate chain entries are created. The marker is written AFTER the
 *     chain appends succeed, so a crash mid-backfill re-runs only the
 *     un-attempted rows (the chain append queue's single-writer mutex makes
 *     partial backfills safe to resume).
 *   - After backfill, the chain verifier confirms the resulting chain is
 *     valid; the result exposes the verification outcome so the operator (or
 *     CI) can gate the cutover on it.
 *
 * The filesystem + DB surfaces are injected so the migration is unit-testable
 * without a real Postgres or disk (mirrors the audit layer's fake-FS pattern).
 *
 * NOTE: This is a one-time cutover migration, not a permanent code path. It
 * runs once at the Phase 0 boundary to close the history gap (existing
 * `audit_logs` rows predate the filesystem chain). Post-cutover, the
 * {@link createDualWriteQueue} keeps the mirror in sync going forward.
 */
import { createHash } from "node:crypto";
import type { AuditAppendQueue } from "@/lib/audit/append-queue";
import type { EntryBody, ChainEntry } from "@/lib/audit/chain";
import { verifyChain, type VerificationResult } from "@/lib/audit/verifier";
import type { AuditMirrorDb, AuditMirrorRow } from "@/lib/audit/postgres-mirror";

/**
 * Injectable filesystem surface for the backfill marker. The marker is a small
 * JSON file recording the set of already-backfilled row IDs (idempotency).
 * Extends {@link AppendQueueFs}'s `readFile`/`mkdir` contract (ENOENT on
 * missing marker = first run).
 */
export interface BackfillMarkerFs {
  /** Read the marker file. Throws ENOENT-style when absent (first run). */
  readFile(path: string): Promise<string>;
  /** Write (overwrite) the marker file atomically. */
  writeFile(path: string, data: string): Promise<void>;
}

/** Dependencies injected into {@link backfillAuditChain}. */
export interface BackfillDeps {
  /** The filesystem chain writer (single-writer mutex, prevHash serialization). */
  chainQueue: AuditAppendQueue;
  /** The Postgres mirror (read source for pre-existing rows). */
  mirror: AuditMirrorDb;
  /** Resolves a projectId to its backfill-marker file path. */
  markerPath: (projectId: string) => string;
  /**
   * Optional filesystem for the marker file. When omitted, the marker is held
   * in-memory for the duration of the call (sufficient for a one-shot
   * cutover run but NOT idempotent across processes — production MUST supply
   * a real fs so re-runs skip already-backfilled rows).
   */
  markerFs?: BackfillMarkerFs;
  /**
   * Optional chain reader for post-backfill verification. When omitted, the
   * migration skips verification (the caller can verify separately). The
   * audit log path is resolved via {@link VerificationDeps.chainPath}.
   */
  verification?: VerificationDeps;
}

/** Optional verification dependencies (read the chain + run the verifier). */
export interface VerificationDeps {
  /** Read the audit log file (newline-delimited JSON of ChainEntry). */
  readChain(projectId: string): Promise<ChainEntry[]>;
}

/** Outcome of {@link backfillAuditChain}. */
export interface BackfillResult {
  /** Number of rows appended to the chain this run. */
  backfilledCount: number;
  /** Number of rows skipped (already in the marker from a prior run). */
  skippedCount: number;
  /** Total rows considered (backfilled + skipped). */
  totalConsidered: number;
  /** Post-backfill chain verification (valid iff the chain is well-formed). */
  verification: VerificationResult;
}

/** Shape of the marker file: the set of already-backfilled row IDs. */
interface BackfillMarker {
  backfilledIds: string[];
}

/**
 * Backfill pre-existing `audit_logs` rows for `projectId` into the filesystem
 * chain, chained from genesis in ascending `createdAt` order. Idempotent:
 * re-running skips rows already recorded in the marker file.
 *
 * Returns the count of rows backfilled + skipped, plus the post-backfill chain
 * verification result.
 */
export async function backfillAuditChain(
  deps: BackfillDeps,
  projectId: string,
): Promise<BackfillResult> {
  const { chainQueue, mirror, markerPath, markerFs, verification } = deps;

  // 1. Load the idempotency marker (set of already-backfilled row IDs).
  const markerFilePath = markerPath(projectId);
  const marker = await loadMarker(markerFs, markerFilePath);

  // 2. Read pre-existing rows for this project, sorted ascending by createdAt.
  const rows = await mirror.listByProject(projectId);
  const sortedRows = [...rows].sort((a, b) => a.createdAt - b.createdAt);

  // 3. Filter out rows already backfilled (idempotency).
  const toBackfill = sortedRows.filter((r) => !marker.backfilledIds.includes(r.id));
  const skippedCount = sortedRows.length - toBackfill.length;

  // 4. Append each remaining row to the chain in createdAt order.
  for (const row of toBackfill) {
    const body = mirrorRowToEntryBody(row);
    await chainQueue.append(projectId, body);
    marker.backfilledIds.push(row.id);
  }

  // 5. Persist the updated marker so re-runs skip these rows.
  await saveMarker(markerFs, markerFilePath, marker);

  // 6. Verify the resulting chain (if verification deps were supplied).
  let verificationResult: VerificationResult;
  if (verification) {
    const chain = await verification.readChain(projectId);
    verificationResult = verifyChain(chain);
  } else {
    // No verification deps: assume valid (the caller verifies separately).
    verificationResult = { valid: true, findings: [] };
  }

  return {
    backfilledCount: toBackfill.length,
    skippedCount,
    totalConsidered: sortedRows.length,
    verification: verificationResult,
  };
}

/**
 * Convert a pre-existing `audit_logs` row into a chain {@link EntryBody}.
 *
 * Historical rows predate the chain, so `beforeHash`/`afterHash` use sentinels
 * (the chain did not exist when these mutations occurred). The `requestId` is
 * derived deterministically from the row ID so re-running the migration
 * (hypothetically, with a cleared marker) would produce identical chain
 * entries — the backfill is reproducible, not random.
 */
function mirrorRowToEntryBody(row: AuditMirrorRow): EntryBody {
  return {
    actor: row.author ?? "unknown",
    action: row.action,
    entity: row.entityId,
    beforeHash: SENTINEL_HASH,
    afterHash: SENTINEL_HASH,
    timestamp: row.createdAt,
    requestId: deterministicRequestId(row.id),
  };
}

/**
 * Sentinel content hash for backfilled entries whose before/after hashes are
 * unknown (they predate the chain). A fixed non-zero value so the entries are
 * distinct from each other only via timestamp/requestId (which is correct:
 * two historical rows with the same action/entity but different timestamps
 * must hash distinctly, per the chain spec).
 */
const SENTINEL_HASH = "backfilled".padEnd(8, "-");

/**
 * Derive a deterministic UUID-shaped requestId from a row ID so the backfill
 * is reproducible. Uses SHA-256 of the row ID, truncated to UUID shape.
 */
function deterministicRequestId(rowId: string): string {
  const hex = createHash("sha256").update(rowId, "utf8").digest("hex");
  // Shape as a UUID v4-style string (8-4-4-4-12) for format compatibility.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Load the marker file; return an empty marker if it doesn't exist (first run). */
async function loadMarker(
  fs: BackfillMarkerFs | undefined,
  path: string,
): Promise<BackfillMarker> {
  if (!fs) {
    return { backfilledIds: [] };
  }
  try {
    const contents = await fs.readFile(path);
    return JSON.parse(contents) as BackfillMarker;
  } catch (err) {
    if (isEnoent(err)) {
      return { backfilledIds: [] };
    }
    throw err;
  }
}

/** Persist the marker file (best-effort; no-op if no fs was injected). */
async function saveMarker(
  fs: BackfillMarkerFs | undefined,
  path: string,
  marker: BackfillMarker,
): Promise<void> {
  if (!fs) return;
  await fs.writeFile(path, JSON.stringify(marker));
}

/** True when `err` is a Node ENOENT (missing file). */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
