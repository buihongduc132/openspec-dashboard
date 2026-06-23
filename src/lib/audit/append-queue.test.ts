/**
 * Task 5.3 (RED) — Per-project single-writer append queue for the audit log
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Single-writer append queue per project"; design D0-3).
 *
 *   "A per-project serial append queue SHALL ensure no two concurrent
 *    appends read the same `prevHash`."
 *
 * Two scenarios asserted here (the ones task 5.3 enumerates):
 *  1. Concurrent appends serialize: N concurrent appends to the SAME project
 *     all land; the resulting chain is well-formed (each entry's prevHash
 *     equals the previous entry's hash) and NO entry is lost or written with
 *     a stale prevHash.
 *  2. Queue survives process restart: a fresh queue instance pointing at the
 *     same audit file re-reads the last persisted hash as the chain head —
 *     the first append after restart chains to the pre-restart head, not to
 *     genesis.
 */
import { describe, expect, it } from "vitest";
import {
  createAppendQueue,
  type AppendQueueFs,
} from "./append-queue";
import { GENESIS_HASH, type ChainEntry, type EntryBody } from "./chain";

/**
 * In-memory fake filesystem: a Map<projectId, file-contents> with the
 * AppendQueueFs surface. readFile resolves asynchronously so concurrency is
 * observable (the mutex must serialize; otherwise concurrent appends read the
 * same cached head and produce a broken chain).
 */
function makeFakeFs(): AppendQueueFs & {
  files: Map<string, string>;
  writes: string[];
} {
  const files = new Map<string, string>();
  const writes: string[] = [];
  const fs: AppendQueueFs & { files: Map<string, string>; writes: string[] } = {
    files,
    writes,
    async mkdir() {
      /* no-op */
    },
    async readFile(path) {
      // Yield so concurrent appends interleave unless the mutex serializes.
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
      // Yield before the write to widen the concurrency window.
      await Promise.resolve();
      await Promise.resolve();
      const prev = files.get(path) ?? "";
      files.set(path, prev + data);
      writes.push(path);
    },
  };
  return fs;
}

function body(i: number): EntryBody {
  return {
    actor: "alice",
    action: "task.update",
    entity: `task:t-${i}`,
    beforeHash: "0".repeat(8),
    afterHash: "f".repeat(8),
    timestamp: 1_700_000_000_000 + i,
    requestId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  };
}

function pathFor(projectId: string): string {
  return `/sidecar/${projectId}/audit.log`;
}

/** Parse the audit file into ChainEntry lines (skipping trailing blank line). */
function parseChain(contents: string): ChainEntry[] {
  return contents
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ChainEntry);
}

describe("per-project append queue — concurrent appends serialize", () => {
  it("serializes N concurrent appends into a well-formed chain with no lost entries", async () => {
    const fs = makeFakeFs();
    const queue = createAppendQueue(fs, pathFor);

    const N = 8;
    // Fire all N appends concurrently against the SAME project.
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => queue.append("p-1", body(i))),
    );

    // Every append resolved with a distinct chained entry.
    expect(results).toHaveLength(N);
    const hashes = results.map((e) => e.hash);
    expect(new Set(hashes).size).toBe(N);

    // The file contains exactly N committed entries.
    const chain = parseChain(fs.files.get(pathFor("p-1")) ?? "");
    expect(chain).toHaveLength(N);

    // The committed chain is well-formed: entry 0 chains to genesis; entry i
    // chains to entry i-1's hash. (If the mutex were absent, several entries
    // would share a prevHash and the chain would be broken/lossy.)
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].prevHash).toBe(chain[i - 1].hash);
    }
  });

  it("serializes per-project (concurrent appends to DIFFERENT projects do not block each other's chain)", async () => {
    const fs = makeFakeFs();
    const queue = createAppendQueue(fs, pathFor);

    await Promise.all([
      queue.append("p-a", body(1)),
      queue.append("p-b", body(2)),
      queue.append("p-a", body(3)),
      queue.append("p-b", body(4)),
    ]);

    const chainA = parseChain(fs.files.get(pathFor("p-a")) ?? "");
    const chainB = parseChain(fs.files.get(pathFor("p-b")) ?? "");
    expect(chainA).toHaveLength(2);
    expect(chainB).toHaveLength(2);
    expect(chainA[1].prevHash).toBe(chainA[0].hash);
    expect(chainB[1].prevHash).toBe(chainB[0].hash);
  });
});

describe("per-project append queue — restart re-reads last persisted hash as head", () => {
  it("a fresh queue instance chains to the pre-restart head, not genesis", async () => {
    const fs = makeFakeFs();

    // --- "process 1": write three entries, then "die" (drop the queue). ---
    const queue1 = createAppendQueue(fs, pathFor);
    const e1 = await queue1.append("p-1", body(1));
    const e2 = await queue1.append("p-1", body(2));
    const e3 = await queue1.append("p-1", body(3));
    // Simulate process death: build a brand-new queue with NO in-memory cache.
    const queue2 = createAppendQueue(fs, pathFor);

    // --- "process 2" (after restart): the next append MUST chain to e3.hash. ---
    const e4 = await queue2.append("p-1", body(4));
    expect(e4.prevHash).toBe(e3.hash);
    expect(e4.prevHash).not.toBe(GENESIS_HASH);

    // headHash reflects the last persisted entry across the restart.
    expect(await queue2.headHash("p-1")).toBe(e4.hash);

    // The committed file has a single contiguous chain from genesis through e4.
    const chain = parseChain(fs.files.get(pathFor("p-1")) ?? "");
    expect(chain).toHaveLength(4);
    expect(chain[0].hash).toBe(e1.hash);
    expect(chain[3].hash).toBe(e4.hash);
    expect(chain[3].prevHash).toBe(e2.hash === e3.hash ? e3.hash : chain[2].hash);
  });
});
