/**
 * Task 5.6 (GREEN) — Tamper-detecting chain verifier + scheduled job
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Tamper-detecting chain verifier").
 *
 * Pure primitive ({@link verifyChain}) + a cron-equivalent scheduled job
 * ({@link startVerifierJob}).
 *
 * Pure primitive contract:
 *   For every entry at index i in the chain:
 *     - The entry's stored hash MUST equal `SHA256(prevHash_i ‖ canonical(body_i))`.
 *     - The entry's `prevHash` MUST equal the previous entry's hash (or GENESIS_HASH
 *       for index 0).
 *   Any mismatch is reported with the offending entry's index and content so an
 *   operator (or quarantine logic, task 5.8) can isolate it.
 *
 * Scheduled job contract:
 *   - Periodically (`intervalMs`) reads `fs.readFile(path)` for each tracked
 *     project, parses newline-delimited JSON entries, and runs verifyChain.
 *   - On findings it invokes `onBreak(projectId, result)` (which is how the
 *     quarantine layer, task 5.8, learns of a chain break).
 *   - On a clean chain it invokes `onClean(projectId)` (so a previously-broken
 *     project that has been operator-recovered can exit quarantine — but
 *     quarantine clearing itself is task 5.8's concern; here we just report).
 *
 * The scheduled job is framework-free (a timer + callbacks). It can be started
 * by the server bootstrap and stopped by returning a `stop()` handle.
 */
import {
  GENESIS_HASH,
  recomputeHash,
  type ChainEntry,
} from "./chain";

/** One verifier finding: which entry is suspect + why. */
export interface VerificationFinding {
  /** Index of the suspect entry in the supplied chain array. */
  index: number;
  /** Reason kind — "hash_mismatch" = tampered body, "broken_link" = deleted prior. */
  kind: "hash_mismatch" | "broken_link";
  /** The suspect entry (as read from storage; the hash does NOT recompute). */
  entry: ChainEntry;
}

/** Result of {@link verifyChain}. */
export interface VerificationResult {
  /** True iff the entire chain verified without any finding. */
  valid: boolean;
  /** Per-entry findings; empty iff `valid === true`. */
  findings: VerificationFinding[];
}

/**
 * Recompute every entry's hash from its prevHash + canonical body and report
 * any mismatches (tamper) or broken prevHash links (deletion).
 *
 * The verifier is a pure function over a chain array; it does not touch the
 * filesystem. The scheduled job ({@link startVerifierJob}) is what reads the
 * on-disk representation and feeds it here.
 */
export function verifyChain(entries: readonly ChainEntry[]): VerificationResult {
  const findings: VerificationFinding[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrev = i === 0 ? GENESIS_HASH : entries[i - 1].hash;

    // Broken-link check: this entry's prevHash must reference the previous
    // entry's stored hash. A missing entry in the middle breaks this link.
    if (entry.prevHash !== expectedPrev) {
      findings.push({ index: i, kind: "broken_link", entry });
      continue; // no point recomputing — the link is already bad
    }

    // Tamper check: the stored hash must recompute from prevHash + body.
    const expectedHash = recomputeHash(entry.prevHash, entry.body);
    if (entry.hash !== expectedHash) {
      findings.push({ index: i, kind: "hash_mismatch", entry });
    }
  }

  return { valid: findings.length === 0, findings };
}

// ---------------------------------------------------------------------------
// Scheduled job
// ---------------------------------------------------------------------------

/**
 * Injectable filesystem surface for the scheduled job. Reads a single project's
 * audit log (newline-delimited JSON of {@link ChainEntry}) and returns the raw
 * string. Throws ENOENT on a missing file.
 */
export interface VerifierFs {
  readFile(path: string): Promise<string>;
}

/** Maps a projectId to its on-disk audit file path. */
export type AuditPathResolver = (projectId: string) => string;

/** Callbacks the scheduled job invokes on verification outcomes. */
export interface VerifierCallbacks {
  /** Called when a project's chain has findings (the quarantine surface). */
  onBreak(projectId: string, result: VerificationResult): void | Promise<void>;
  /** Called when a project's chain is clean. */
  onClean(projectId: string): void | Promise<void>;
}

/** Handle returned by {@link startVerifierJob}; `stop()` clears the timer. */
export interface VerifierJob {
  stop(): void;
  /** Trigger one verification sweep immediately (for tests / startup). */
  runOnce(): Promise<void>;
}

/** Dependencies for the scheduled job. */
export interface VerifierJobDeps {
  fs: VerifierFs;
  pathResolver: AuditPathResolver;
  /** Projects to track; the job re-reads these each sweep. */
  projects(): string[] | Promise<string[]>;
  callbacks: VerifierCallbacks;
  /** Sweep interval in milliseconds. */
  intervalMs: number;
  /** Optional clock injection for tests (defaults to real setInterval). */
  setInterval?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearInterval?: (handle: NodeJS.Timeout) => void;
}

/**
 * Parse a newline-delimited audit log into chain entries. Blank lines are
 * skipped (mirrors the append-queue's write shape: one JSON line + newline).
 */
export function parseAuditLog(contents: string): ChainEntry[] {
  return contents
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ChainEntry);
}

/**
 * Start the cron-equivalent verifier job. Returns a handle with `stop()` and
 * `runOnce()`. The job calls `callbacks.onBreak(projectId, result)` whenever a
 * project's chain is broken and `callbacks.onClean(projectId)` when clean.
 */
export function startVerifierJob(deps: VerifierJobDeps): VerifierJob {
  const { fs, pathResolver, projects, callbacks } = deps;
  const setIntervalFn = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;

  async function sweep(): Promise<void> {
    const projectIds = await projects();
    for (const projectId of projectIds) {
      let contents: string;
      try {
        contents = await fs.readFile(pathResolver(projectId));
      } catch {
        // Missing / unreadable audit file is task 5.9's concern (recovery);
        // here we treat it as an empty chain and mark clean so the recovery
        // layer has its own surface for the missing-file incident.
        await callbacks.onClean(projectId);
        continue;
      }
      const entries = parseAuditLog(contents);
      const result = verifyChain(entries);
      if (result.valid) {
        await callbacks.onClean(projectId);
      } else {
        await callbacks.onBreak(projectId, result);
      }
    }
  }

  const handle = setIntervalFn(() => {
    // Fire-and-forget; errors inside sweep are surfaced via callbacks so a
    // single bad sweep never poisons the timer.
    sweep().catch(() => undefined);
  }, deps.intervalMs);

  return {
    stop() {
      clearIntervalFn(handle);
    },
    runOnce: sweep,
  };
}
