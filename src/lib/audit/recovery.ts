/**
 * Task 5.10 (GREEN) — Startup recovery for missing/partial/unreadable audit
 * files (change `phase0-foundations`, spec `audit-chain`, req
 * "Tamper-detecting chain verifier" edge-case scenarios).
 *
 * The append-queue (task 5.4) re-reads the last persisted hash as the chain
 * head on a cold start, but it assumes the live audit file is well-formed and
 * readable. This module is the defensive startup layer that runs BEFORE any
 * mutating endpoint is served and reconciles the on-disk audit file against
 * three edge cases the spec calls out explicitly:
 *
 *   1. **File missing on startup** → the chain is re-initialized from the
 *      fixed genesis hash. No quarantine (a brand-new project is normal).
 *
 *   2. **Partial write (mid-flush crash)** → an orphan temp sibling
 *      (`<auditfile>.tmp[.…]`) is detected + deleted, and a trailing partial
 *      (unparseable) line in the live log is truncated so the chain resumes
 *      from the last fully-persisted entry. The live log never holds a
 *      partial entry.
 *
 *   3. **Unreadable file (EACCES / EIO / …)** → the chain is unverified and
 *      cannot be trusted; recovery enters read-only quarantine immediately
 *      (an operator incident) and reports the cause.
 *
 * The filesystem surface is injected so the recovery logic is unit-testable
 * without touching a real disk, mirroring the append-queue / verifier layers.
 *
 * NOTE on the temp-file convention: the append-queue itself appends in a
 * single write, but a future atomic (temp + rename) flusher, or a crash
 * during any dashboard-private write that shares the audit dir, can leave an
 * orphan temp. Recovery treats any sibling whose basename starts with the
 * audit file's basename followed by the temp marker (`.tmp`) as an orphan
 * temp and removes it — the canonical audit file itself is never a temp.
 */
import { basename, dirname } from "node:path";
import { GENESIS_HASH, type ChainEntry } from "./chain";
import type { QuarantineState } from "./quarantine";

/**
 * Injectable filesystem surface for startup recovery. Mirrors the subset of
 * `node:fs/promises` the recovery layer needs.
 */
export interface AuditRecoveryFs {
  /** Read a file. Throw with `code === "ENOENT"` when absent (matching node:fs). */
  readFile(path: string): Promise<string>;
  /** List basenames in a directory. */
  readdir(dir: string): Promise<string[]>;
  /** Delete a file (orphan temp). Idempotent enough that ENOENT is tolerated. */
  unlink(path: string): Promise<void>;
  /** Rewrite the live log after truncating a trailing partial line. */
  writeFile(path: string, data: string): Promise<void>;
}

/** Resolves a projectId to its audit-file path (mirrors the append-queue). */
export type AuditPathResolver = (projectId: string) => string;
/** Resolves a projectId to the directory holding its audit file. */
export type AuditDirResolver = (projectId: string) => string;

/** Outcome of {@link recoverAuditFile}. */
export type AuditRecoveryResult =
  | {
      /** The file was missing, clean, or repaired in place. */
      status: "recovered";
      /** Hash of the last full entry (genesis for an empty/missing file). */
      headHash: string;
      /** Absolute paths of orphan temp siblings that were deleted. */
      tempFilesDeleted: string[];
      /** True if a trailing partial line was truncated from the live log. */
      partialTruncated: boolean;
    }
  | {
      /** The file exists but cannot be read — unverified, cannot be trusted. */
      status: "quarantined";
      /** Project whose audit file is unreadable. */
      projectId: string;
      /** Human-readable cause (the offending errno code + message). */
      cause: string;
    };

/** Dependencies for {@link recoverAuditFile}. */
export interface AuditRecoveryDeps {
  fs: AuditRecoveryFs;
  pathResolver: AuditPathResolver;
  dirResolver: AuditDirResolver;
  /** Entered immediately on an unreadable audit file. */
  quarantine: QuarantineState;
}

/** Basename marker that identifies an orphan atomic-write temp sibling. */
const TEMP_MARKER = ".tmp";

/**
 * Run startup recovery for `projectId`'s audit file.
 *
 * Order of operations (each defensive, each independently testable):
 *
 *   1. Sweep the audit directory for orphan temp siblings and delete them.
 *   2. Try to read the live audit file.
 *      - ENOENT → missing file is normal for a new project; report genesis.
 *      - any other read error → unreadable → enter quarantine + report.
 *   3. Parse the live log line by line. A trailing line that fails to parse
 *      (a partial flush) is truncated and the file is rewritten without it.
 *   4. Report the recovered head hash (genesis for an empty/missing file).
 *
 * Quarantine is entered EXACTLY ONCE on the unreadable path (the quarantine
 * state itself is idempotent — first break wins).
 */
export async function recoverAuditFile(
  projectId: string,
  deps: AuditRecoveryDeps,
): Promise<AuditRecoveryResult> {
  const { fs, pathResolver, dirResolver, quarantine } = deps;
  const livePath = pathResolver(projectId);

  // 1. Remove orphan temp siblings left by a crashed atomic append.
  const tempFilesDeleted = await sweepTempFiles(projectId, deps);

  // 2. Read the live audit file.
  let contents: string;
  try {
    contents = await fs.readFile(livePath);
  } catch (err) {
    if (isEnoent(err)) {
      // Missing file on startup → re-init from genesis. Normal for a new
      // project; NOT an incident.
      return {
        status: "recovered",
        headHash: GENESIS_HASH,
        tempFilesDeleted,
        partialTruncated: false,
      };
    }
    // Unreadable (EACCES / EIO / …) → the chain is unverified; quarantine
    // immediately and surface an operator incident.
    const cause = errnoCause(err);
    quarantine.enter({
      projectId,
      findings: [
        {
          index: -1,
          kind: "hash_mismatch",
          entry: unreadableIncidentEntry(projectId, cause),
        },
      ],
    });
    return { status: "quarantined", projectId, cause };
  }

  // 3. Truncate any trailing partial (unparseable) line.
  const { lines, partialTruncated } = parseValidLines(contents);
  if (partialTruncated) {
    const repaired = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    await fs.writeFile(livePath, repaired);
  }

  // 4. Recovered head hash = last full entry's hash (genesis if empty).
  const headHash =
    lines.length > 0
      ? (JSON.parse(lines[lines.length - 1]) as ChainEntry).hash
      : GENESIS_HASH;

  return {
    status: "recovered",
    headHash,
    tempFilesDeleted,
    partialTruncated,
  };
}

/**
 * Scan the audit directory for orphan temp siblings of the live audit file
 * and delete them. A "temp sibling" is any entry in the same directory whose
 * basename starts with the audit file's basename immediately followed by the
 * temp marker (e.g. `p-1.log.tmp`, `p-1.log.tmp.123`). The canonical audit
 * file itself is never treated as a temp.
 */
async function sweepTempFiles(
  projectId: string,
  deps: AuditRecoveryDeps,
): Promise<string[]> {
  const { fs, pathResolver, dirResolver } = deps;
  const livePath = pathResolver(projectId);
  const dir = dirResolver(projectId);
  const liveBase = basename(livePath);
  const prefix = `${liveBase}${TEMP_MARKER}`;

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // Missing directory ⇔ missing file ⇔ genesis; nothing to sweep.
    return [];
  }

  const deleted: string[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const full = joinDir(dir, entry);
    try {
      await fs.unlink(full);
      deleted.push(full);
    } catch {
      // Best-effort cleanup: an unlink failure (e.g. already gone) is not
      // fatal to recovery; the entry is simply not reported as deleted.
    }
  }
  return deleted;
}

/**
 * Parse newline-delimited JSON lines, preserving every line that parses as a
 * {@link ChainEntry} and dropping a TRAILING run of unparseable lines (a
 * partial flush). Interior unparseable lines are also dropped defensively;
 * `partialTruncated` is true iff at least one line was dropped.
 *
 * NOTE: dropping an interior partial line is conservative — the verifier
 * (task 5.6) is the authority on whether the surviving chain is internally
 * consistent; recovery only guarantees "no partial bytes in the live log".
 */
function parseValidLines(contents: string): {
  lines: string[];
  partialTruncated: boolean;
} {
  const all = contents.split("\n").filter((l) => l.trim().length > 0);
  const valid: string[] = [];
  let dropped = 0;
  for (const line of all) {
    try {
      const parsed = JSON.parse(line) as ChainEntry;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.hash === "string" &&
        typeof parsed.prevHash === "string"
      ) {
        valid.push(line);
        continue;
      }
    } catch {
      // fall through — treat as partial.
    }
    dropped += 1;
  }
  return { lines: valid, partialTruncated: dropped > 0 };
}

/** True when `err` is a Node ENOENT (missing file / missing directory). */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/** Human-readable cause for an unreadable-file error (errno + message). */
function errnoCause(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as NodeJS.ErrnoException;
    const code = typeof e.code === "string" ? e.code : "UNKNOWN";
    const msg = e.message ?? "unreadable audit file";
    return `${code}: ${msg}`;
  }
  return `UNKNOWN: ${String(err)}`;
}

/** Build a synthetic incident entry so the quarantine reason is non-empty. */
function unreadableIncidentEntry(projectId: string, cause: string): ChainEntry {
  return {
    prevHash: GENESIS_HASH,
    hash: `unreadable:${projectId}`,
    body: {
      actor: "system:recovery",
      action: "audit.unreadable",
      entity: `audit:${projectId}`,
      beforeHash: "",
      afterHash: "",
      timestamp: 0,
      requestId: cause,
    },
  };
}

/** Join a directory path and a basename without normalizing away structure. */
function joinDir(dir: string, entry: string): string {
  return dir.endsWith("/") ? `${dir}${entry}` : `${dir}/${entry}`;
}
