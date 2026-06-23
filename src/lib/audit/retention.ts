/**
 * Task 5.12 (GREEN) — Retention via archive-then-delete + per-project erasure
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Retention via archive-then-delete (D-AuditRetention)").
 *
 *   "Retention expiry SHALL move entries to a cold archive (chain hash
 *    preserved) and then delete them from the live log. Right-to-erasure
 *    for a project SHALL archive that project's entire chain to offline
 *    storage and delete it from the live log; other projects' chains are
 *    untouched."
 *
 * Design (hash preservation): retention does NOT re-hash anything. Expired
 * entries are copied VERBATIM (body + prevHash + hash intact) into a cold
 * archive file, then removed from the live log. Because hashes are preserved,
 * the original chain can always be reconstructed by concatenating
 * `archive ++ live` — and the two halves stay verifiable independently:
 *
 *   - The archive segment is verified with {@link verifySegment}, which checks
 *     every entry's stored hash recomputes from its own prevHash + canonical
 *     body (tamper check) and that consecutive entries link (i>0). It does NOT
 *     require the segment's first entry to anchor at genesis — a retained
 *     segment legitimately begins mid-chain.
 *   - The cross-link invariant (`retained[0].prevHash === archive[last].hash`,
 *     or genesis when nothing was archived) proves the two segments still join
 *     into the original unbroken chain.
 *
 * Per-project erasure is the degenerate case: the WHOLE chain is the "expired"
 * set, so the archive is the full genesis-anchored chain (verifiable with the
 * standard {@link verifyChain}) and the live log is deleted. Only the target
 * project's files are touched; sibling projects' audit files are never read or
 * written by this module, so they are byte-identical before and after.
 *
 * The filesystem surface is injected (`RetentionFs`) so the logic is
 * unit-testable without a real disk (mirrors the append-queue / verifier
 * fake-FS pattern). `RetentionFs` extends {@link AppendQueueFs} with
 * `writeFile`, so the same in-memory fake can back a real append-queue-built
 * chain AND the retention layer that archives it.
 */
import { dirname } from "node:path";
import {
  GENESIS_HASH,
  recomputeHash,
  type ChainEntry,
} from "./chain";
import type { VerificationResult } from "./verifier";

/** Injectable filesystem surface for retention. */
export interface RetentionFs {
  /** Read the audit file. Throws ENOENT-style when absent. */
  readFile(path: string): Promise<string>;
  /** Overwrite the audit file with `data` (rewriting the trimmed live log). */
  writeFile(path: string, data: string): Promise<void>;
  /** Delete the audit file (used when the live log is emptied by erasure). */
  deleteFile(path: string): Promise<void>;
  /** Ensure the parent directory of an archive file exists. */
  mkdir(dir: string): Promise<void>;
}

/** Resolves a projectId to its live audit-log path. */
export type LiveLogPathResolver = (projectId: string) => string;

/** The kind of archive being written (selects the archive filename). */
export type ArchiveKind = "retention" | "erasure";

/** Resolves a projectId + kind to its cold-archive path. */
export type ArchivePathResolver = (
  projectId: string,
  kind: ArchiveKind,
) => string;

/** Dependencies injected into the retention operations. */
export interface RetentionDeps {
  fs: RetentionFs;
  liveLogPath: LiveLogPathResolver;
  archivePath: ArchivePathResolver;
}

/** Outcome of a retention / erasure operation. */
export interface RetentionResult {
  /** Project whose chain was archived. */
  projectId: string;
  /** Number of entries moved to the archive (verbatim). */
  archivedCount: number;
  /** Number of entries remaining in the live log (0 for full erasure). */
  retainedCount: number;
  /** Path of the cold archive file that was written. */
  archivePath: string;
  /**
   * Verification of the archive segment. For partial retention this uses
   * {@link verifySegment} (mid-chain-anchored); for full erasure it uses the
   * standard genesis-anchored verification (the whole chain is archived).
   */
  archive: VerificationResult;
  /** Verification of the retained live-log segment ({@link verifySegment}). */
  retained: VerificationResult;
  /**
   * Cross-link invariant: `retained[0].prevHash === archive[last].hash`, or
   * `retained[0].prevHash === GENESIS_HASH` when nothing was archived. Proves
   * the two segments still reconstruct the original unbroken chain.
   */
  crossLinkHolds: boolean;
}

/**
 * Move entries whose `body.timestamp` is strictly less than `cutoffMs` to a
 * cold archive (hashes preserved), then rewrite the live log with the rest.
 *
 * Idempotent in shape: re-running with the same cutoff against an already-trimmed
 * live log archives nothing new. Entries are copied verbatim — no re-hashing —
 * so {@link RetentionResult.crossLinkHolds} proves `archive ++ live` still
 * reconstructs the original chain.
 */
export async function archiveRetention(
  deps: RetentionDeps,
  projectId: string,
  cutoffMs: number,
): Promise<RetentionResult> {
  const { fs, liveLogPath, archivePath } = deps;
  const livePath = liveLogPath(projectId);

  const entries = await readChain(fs, livePath);
  const expired = entries.filter((e) => e.body.timestamp < cutoffMs);
  const retained = entries.filter((e) => e.body.timestamp >= cutoffMs);

  return commitRetention(
    deps,
    projectId,
    "retention",
    expired,
    retained,
    livePath,
  );
}

/**
 * Right-to-erasure: archive the project's ENTIRE chain (verbatim) to an
 * offline archive and delete the live log. Sibling projects are untouched
 * (this module never reads or writes any other project's audit file).
 */
export async function eraseProject(
  deps: RetentionDeps,
  projectId: string,
): Promise<RetentionResult> {
  const { fs, liveLogPath } = deps;
  const livePath = liveLogPath(projectId);

  const entries = await readChain(fs, livePath);

  return commitRetention(
    deps,
    projectId,
    "erasure",
    entries, // everything is archived
    [], // live log ends up empty
    livePath,
  );
}

/**
 * Shared tail of {@link archiveRetention} / {@link eraseProject}: write the
 * archive, rewrite (or delete) the live log, and report verifiability.
 */
async function commitRetention(
  deps: RetentionDeps,
  projectId: string,
  kind: ArchiveKind,
  archived: ChainEntry[],
  retained: ChainEntry[],
  livePath: string,
): Promise<RetentionResult> {
  const { fs, archivePath } = deps;
  const dest = archivePath(projectId, kind);

  if (archived.length > 0) {
    await fs.mkdir(dirname(dest));
    await fs.writeFile(dest, serializeChain(archived));
  }

  // Rewrite the live log with only the retained entries; if nothing remains
  // (full erasure), delete the live log entirely so the next append
  // re-initializes from genesis — matches recovery D0-3.
  if (retained.length > 0) {
    await fs.writeFile(livePath, serializeChain(retained));
  } else {
    await safeDelete(fs, livePath);
  }

  // A full erasure archives the genesis-anchored whole chain → standard
  // verification. A partial retention archives a mid-chain segment → segment
  // verification (no genesis requirement at index 0).
  const archiveResult =
    kind === "erasure" ? verifyChainWhole(archived) : verifySegment(archived);

  const retainedResult = verifySegment(retained);

  const crossLinkHolds = checkCrossLink(archived, retained);

  return {
    projectId,
    archivedCount: archived.length,
    retainedCount: retained.length,
    archivePath: dest,
    archive: archiveResult,
    retained: retainedResult,
    crossLinkHolds,
  };
}

/**
 * Verify a chain SEGMENT: every entry's stored hash recomputes from its own
 * prevHash + canonical body (tamper check on every entry), and consecutive
 * entries link (entry[i].prevHash === entry[i-1].hash for i>0). Unlike
 * {@link verifyChainWhole}, the segment's first entry is NOT required to
 * anchor at genesis — a retained segment legitimately begins mid-chain, with
 * its prevHash pointing back at the last archived entry.
 */
export function verifySegment(entries: readonly ChainEntry[]): VerificationResult {
  const findings: { index: number; kind: "hash_mismatch" | "broken_link"; entry: ChainEntry }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i > 0 && entry.prevHash !== entries[i - 1].hash) {
      findings.push({ index: i, kind: "broken_link", entry });
      continue;
    }
    if (entry.hash !== recomputeHash(entry.prevHash, entry.body)) {
      findings.push({ index: i, kind: "hash_mismatch", entry });
    }
  }

  return { valid: findings.length === 0, findings };
}

/**
 * Standard genesis-anchored verification (used for a full-chain erasure
 * archive). Imported lazily via a local reimplementation to avoid a circular
 * dependency with `verifier.ts` (which re-exports types from here) and to keep
 * this module self-contained for the hash-preservation contract.
 */
function verifyChainWhole(entries: readonly ChainEntry[]): VerificationResult {
  const findings: { index: number; kind: "hash_mismatch" | "broken_link"; entry: ChainEntry }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrev = i === 0 ? GENESIS_HASH : entries[i - 1].hash;
    if (entry.prevHash !== expectedPrev) {
      findings.push({ index: i, kind: "broken_link", entry });
      continue;
    }
    if (entry.hash !== recomputeHash(entry.prevHash, entry.body)) {
      findings.push({ index: i, kind: "hash_mismatch", entry });
    }
  }

  return { valid: findings.length === 0, findings };
}

/**
 * Cross-link invariant: the retained segment's first entry must chain to the
 * last archived entry's hash (or to genesis when nothing was archived), and a
 * full erasure (empty retained) trivially satisfies the invariant.
 */
function checkCrossLink(
  archived: readonly ChainEntry[],
  retained: readonly ChainEntry[],
): boolean {
  if (retained.length === 0) {
    return true;
  }
  const expectedPrev = archived.length > 0 ? archived[archived.length - 1].hash : GENESIS_HASH;
  return retained[0].prevHash === expectedPrev;
}

/** Read + parse a newline-delimited audit log (empty/missing → empty array). */
async function readChain(
  fs: RetentionFs,
  path: string,
): Promise<ChainEntry[]> {
  let contents: string;
  try {
    contents = await fs.readFile(path);
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  return parseChain(contents);
}

/** Parse newline-delimited chain entries (blank lines skipped). */
function parseChain(contents: string): ChainEntry[] {
  return contents
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ChainEntry);
}

/** Serialize chain entries back to the on-disk newline-delimited shape. */
function serializeChain(entries: readonly ChainEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : "");
}

/** Delete a file if it exists; swallow ENOENT (file already gone). */
async function safeDelete(fs: RetentionFs, path: string): Promise<void> {
  try {
    await fs.deleteFile(path);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
}

/** True when `err` is a Node ENOENT (missing file). */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
