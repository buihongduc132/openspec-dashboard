/**
 * Task 5.12 (RED) — Retention via archive-then-delete + per-project erasure
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Retention via archive-then-delete (D-AuditRetention)").
 *
 *   "Retention expiry SHALL move entries to a cold archive (chain hash
 *    preserved) and then delete them from the live log. Right-to-erasure
 *    for a project SHALL archive that project's entire chain to offline
 *    storage and delete it from the live log; other projects' chains are
 *    untouched."
 *
 * Two scenarios asserted here (the ones task 5.12 enumerates):
 *  1. Retention archive preserves chain verifiability — entries older than
 *     the retention window are moved (verbatim, hashes preserved) to a cold
 *     archive that is independently verifiable, then deleted from the live
 *     log. The retained live-log segment stays verifiable and the archive ++
 *     retained segments reconstruct the original valid chain.
 *  2. Per-project erasure does not touch siblings — right-to-erasure for
 *     project X archives + deletes X's entire chain; project Y's chain in
 *     the same deployment is byte-identical before and after.
 */
import { describe, expect, it } from "vitest";
import { createAppendQueue, type AppendQueueFs } from "./append-queue";
import {
  GENESIS_HASH,
  recomputeHash,
  type ChainEntry,
  type EntryBody,
} from "./chain";
import { verifyChain } from "./verifier";
import {
  archiveRetention,
  eraseProject,
  type RetentionFs,
} from "./retention";

/**
 * Shared in-memory filesystem used by BOTH the append-queue (to build a real,
 * valid on-disk chain) and the retention layer (which reads/writes the same
 * files). This proves retention operates on the real on-disk chain shape.
 */
function makeFakeFs(): RetentionFs &
  AppendQueueFs & {
    files: Map<string, string>;
  } {
  const files = new Map<string, string>();
  return {
    files,
    async mkdir() {
      /* no-op */
    },
    async readFile(path) {
      await Promise.resolve();
      const v = files.get(path);
      if (v === undefined) {
        const err: NodeJS.ErrnoException = new Error(`ENOENT: ${path}`);
        err.code = "ENOENT";
        throw err;
      }
      return v;
    },
    async appendFile(path, data) {
      await Promise.resolve();
      files.set(path, (files.get(path) ?? "") + data);
    },
    async writeFile(path, data) {
      await Promise.resolve();
      files.set(path, data);
    },
    async deleteFile(path) {
      await Promise.resolve();
      // Reflect a real fs.rm: a missing file is a no-op (no ENOENT) for the
      // retention layer's purposes, but the test fake removes it cleanly.
      files.delete(path);
    },
  };
}

function body(i: number): EntryBody {
  return {
    actor: "alice",
    action: "task.update",
    entity: `task:t-${i}`,
    beforeHash: "0".repeat(8),
    afterHash: "f".repeat(8),
    // Distinct, increasing timestamps so retention cutoff is meaningful.
    timestamp: 1_700_000_000_000 + i * 1000,
    requestId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  };
}

function parseChain(contents: string): ChainEntry[] {
  return contents
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ChainEntry);
}

function livePath(projectId: string): string {
  return `/sidecar/audit/${projectId}.log`;
}

function archivePath(projectId: string, kind: "retention" | "erasure"): string {
  return `/sidecar/audit/archive/${projectId}.${kind}.log`;
}

/** Build a real, valid on-disk chain of `n` entries via the append queue. */
async function seedChain(
  fs: RetentionFs & AppendQueueFs,
  projectId: string,
  n: number,
): Promise<ChainEntry[]> {
  const queue = createAppendQueue(fs, livePath);
  const entries: ChainEntry[] = [];
  for (let i = 0; i < n; i++) {
    entries.push(await queue.append(projectId, body(i)));
  }
  return entries;
}

describe("retention — archive-then-delete preserves chain verifiability", () => {
  it("moves expired entries (hashes preserved) to an independently-verifiable archive and deletes them from the live log", async () => {
    const fs = makeFakeFs();
    const original = await seedChain(fs, "p-1", 6);
    expect(original).toHaveLength(6);

    // cutoff: entries with timestamp < this are expired → first 2 expire.
    const cutoff = body(2).timestamp;
    const result = await archiveRetention(
      { fs, liveLogPath: livePath, archivePath },
      "p-1",
      cutoff,
    );

    // --- archive side ---
    expect(result.archivedCount).toBe(2);
    const archived = parseChain(
      fs.files.get(archivePath("p-1", "retention")) ?? "",
    );
    expect(archived).toHaveLength(2);
    // Hashes preserved verbatim (no re-hashing).
    expect(archived[0].hash).toBe(original[0].hash);
    expect(archived[1].hash).toBe(original[1].hash);
    // The archive segment is independently verifiable.
    expect(result.archive.valid).toBe(true);

    // --- live-log side ---
    expect(result.retainedCount).toBe(4);
    const retained = parseChain(fs.files.get(livePath("p-1")) ?? "");
    expect(retained).toHaveLength(4);
    // Retained segment is verifiable.
    expect(result.retained.valid).toBe(true);
    // Retained entries' hashes preserved verbatim.
    for (let i = 0; i < retained.length; i++) {
      expect(retained[i].hash).toBe(original[i + 2].hash);
    }

    // --- cross-link: retained[0].prevHash === archived[last].hash ---
    expect(result.crossLinkHolds).toBe(true);
    expect(retained[0].prevHash).toBe(archived[archived.length - 1].hash);

    // --- reconstruction: archive ++ retained is the original valid chain ---
    const reconstructed = [...archived, ...retained];
    expect(verifyChain(reconstructed).valid).toBe(true);
    // And it equals the original genesis-anchored chain.
    expect(reconstructed[0].prevHash).toBe(GENESIS_HASH);
    expect(reconstructed[5].hash).toBe(original[5].hash);

    // No tamper: each archived entry still recomputes from its prevHash + body.
    for (let i = 0; i < archived.length; i++) {
      const prev = i === 0 ? GENESIS_HASH : archived[i - 1].hash;
      expect(recomputeHash(prev, archived[i].body)).toBe(archived[i].hash);
    }
  });

  it("retention with no expired entries is a no-op (archive empty, live log untouched)", async () => {
    const fs = makeFakeFs();
    await seedChain(fs, "p-1", 3);
    const before = fs.files.get(livePath("p-1"));

    // cutoff older than every entry → nothing expires.
    const result = await archiveRetention(
      { fs, liveLogPath: livePath, archivePath },
      "p-1",
      0,
    );

    expect(result.archivedCount).toBe(0);
    expect(result.retainedCount).toBe(3);
    expect(fs.files.get(livePath("p-1"))).toBe(before);
    // No archive file is written when nothing expired.
    expect(fs.files.get(archivePath("p-1", "retention"))).toBeUndefined();
  });
});

describe("retention — per-project erasure does not touch siblings", () => {
  it("archives + deletes project X's entire chain while project Y stays byte-identical", async () => {
    const fs = makeFakeFs();
    await seedChain(fs, "X", 4);
    await seedChain(fs, "Y", 3);

    const yBefore = fs.files.get(livePath("Y"));

    const result = await eraseProject(
      { fs, liveLogPath: livePath, archivePath },
      "X",
    );

    // --- project X: archived + deleted ---
    expect(result.archivedCount).toBe(4);
    expect(result.retainedCount).toBe(0);
    const xArchive = parseChain(
      fs.files.get(archivePath("X", "erasure")) ?? "",
    );
    expect(xArchive).toHaveLength(4);
    // The archived whole-chain is verifiable (genesis-anchored).
    expect(result.archive.valid).toBe(true);
    expect(xArchive[0].prevHash).toBe(GENESIS_HASH);
    // The live log is gone (deleted).
    expect(fs.files.get(livePath("X"))).toBeUndefined();

    // --- project Y: byte-identical before and after ---
    expect(fs.files.get(livePath("Y"))).toBe(yBefore);
    const yAfter = parseChain(fs.files.get(livePath("Y")) ?? "");
    expect(yAfter).toHaveLength(3);
    expect(yAfter[0].prevHash).toBe(GENESIS_HASH);
  });
});
