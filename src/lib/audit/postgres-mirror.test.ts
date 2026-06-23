/**
 * Task 5.13 (RED) — Postgres `audit_logs` mirror: dual-write + conflict
 * resolution (change `phase0-foundations`, spec `audit-chain`, reqs
 * "Filesystem chain is truth; Postgres `audit_logs` is a mirror" +
 * design D0-8).
 *
 *   "The Phase 0 audit-emission middleware SHALL write BOTH on every
 *    mutation: (1) the authoritative filesystem chain entry, and (2) a
 *    best-effort row into `audit_logs` with matching fields. On any conflict
 *    or verification gap between the two, the filesystem chain SHALL win and
 *    the Postgres row SHALL be treated as stale."
 *
 * Scenarios asserted here (the ones task 5.13 enumerates for the mirror half):
 *  1. Mutation writes to BOTH chain and mirror — a dual-write append produces
 *     an authoritative chain entry AND a best-effort mirror row with matching
 *     actor/action/entity/timestamp.
 *  2. Mirror write fails but chain write succeeds — the mutation is NOT rolled
 *     back (the chain is authoritative and complete); the mirror miss is
 *     surfaced and the chain entry remains the verifiable record.
 *  3. Conflict between chain and mirror resolves to chain — when a mirror row
 *     was edited post-hoc, reconcile reports it as a finding and treats the
 *     Postgres row as stale (the chain is NOT mutated to match the mirror).
 */
import { describe, expect, it } from "vitest";
import { createAppendQueue, type AppendQueueFs } from "./append-queue";
import { GENESIS_HASH, type ChainEntry, type EntryBody } from "./chain";
import {
  createDualWriteQueue,
  reconcileMirror,
  type AuditMirrorDb,
  type AuditMirrorRow,
  type MirrorEntryMapper,
} from "./postgres-mirror";

/** In-memory fake mirror DB capturing inserted rows; can be made to fail. */
function makeFakeMirrorDb(): AuditMirrorDb & {
  rows: Map<string, AuditMirrorRow>;
  failNext: boolean;
  inserted: AuditMirrorRow[];
} {
  const rows = new Map<string, AuditMirrorRow>();
  const inserted: AuditMirrorRow[] = [];
  return {
    rows,
    inserted,
    failNext: false,
    async insert(row) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error("simulated transient DB error");
      }
      const id = `mirror-${this.rows.size + 1}`;
      const stored: AuditMirrorRow = { ...row, id };
      this.rows.set(id, stored);
      this.inserted.push(stored);
    },
    async listByProject(projectId) {
      return [...this.rows.values()]
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },
  };
}

/** In-memory fake filesystem for the chain append queue. */
function makeFakeFs(): AppendQueueFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async mkdir() {
      /* no-op */
    },
    async readFile(path) {
      const v = files.get(path);
      if (v === undefined) {
        const err: NodeJS.ErrnoException = new Error(`ENOENT: ${path}`);
        err.code = "ENOENT";
        throw err;
      }
      return v;
    },
    async appendFile(path, data) {
      files.set(path, (files.get(path) ?? "") + data);
    },
  };
}

function body(i: number): EntryBody {
  return {
    actor: "alice",
    action: "task.update",
    entity: "task:t-1",
    beforeHash: "0".repeat(8),
    afterHash: "f".repeat(8),
    timestamp: 1_700_000_000_000 + i,
    requestId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  };
}

function pathFor(projectId: string): string {
  return `/sidecar/${projectId}/audit.log`;
}

/** The canonical Phase-0 mapper: EntryBody → audit_logs row fields. */
const mapper: MirrorEntryMapper = (projectId, entry) => ({
  projectId,
  action: entry.body.action,
  entityType: entry.body.entity.split(":")[0] ?? "entity",
  entityId: entry.body.entity,
  author: entry.body.actor,
  details: JSON.stringify({
    beforeHash: entry.body.beforeHash,
    afterHash: entry.body.afterHash,
    requestId: entry.body.requestId,
  }),
  createdAt: entry.body.timestamp,
});

describe("postgres-mirror — dual write (filesystem chain is truth, Postgres is mirror)", () => {
  it("a dual-write append writes BOTH the chain entry AND a matching mirror row", async () => {
    const fs = makeFakeFs();
    const chainQueue = createAppendQueue(fs, pathFor);
    const mirror = makeFakeMirrorDb();
    const dual = createDualWriteQueue(chainQueue, mirror, mapper);

    const entry = await dual.append("p-1", body(1));

    // --- chain side (authoritative) ---
    expect(entry.prevHash).toBe(GENESIS_HASH);
    const chainText = fs.files.get(pathFor("p-1")) ?? "";
    const chain: ChainEntry[] = chainText
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ChainEntry);
    expect(chain).toHaveLength(1);
    expect(chain[0].hash).toBe(entry.hash);

    // --- mirror side (best-effort, matching fields) ---
    expect(mirror.inserted).toHaveLength(1);
    const row = mirror.inserted[0];
    expect(row.action).toBe("task.update");
    expect(row.author).toBe("alice");
    expect(row.entityId).toBe("task:t-1");
    expect(row.createdAt).toBe(entry.body.timestamp);
    expect(row.projectId).toBe("p-1");
  });

  it("mirror write failure does NOT roll back the chain (chain is authoritative)", async () => {
    const fs = makeFakeFs();
    const chainQueue = createAppendQueue(fs, pathFor);
    const mirror = makeFakeMirrorDb();
    mirror.failNext = true;
    const dual = createDualWriteQueue(chainQueue, mirror, mapper);

    // The append MUST resolve (not throw) — the chain write succeeded.
    const entry = await dual.append("p-1", body(1));
    expect(entry.prevHash).toBe(GENESIS_HASH);

    // The chain entry is persisted and verifiable.
    expect(fs.files.get(pathFor("p-1"))).toContain(entry.hash);
    // The mirror miss is surfaced (no row inserted) but the chain is intact.
    expect(mirror.inserted).toHaveLength(0);

    // A subsequent append still works and chains correctly (not poisoned).
    mirror.failNext = false;
    const e2 = await dual.append("p-1", body(2));
    expect(e2.prevHash).toBe(entry.hash);
    expect(mirror.inserted).toHaveLength(1);
  });
});

describe("postgres-mirror — conflict resolves to the filesystem chain", () => {
  it("an edited mirror row is reported as a finding; the chain is NOT mutated to match", async () => {
    const fs = makeFakeFs();
    const chainQueue = createAppendQueue(fs, pathFor);
    const mirror = makeFakeMirrorDb();
    const dual = createDualWriteQueue(chainQueue, mirror, mapper);

    const entry = await dual.append("p-1", body(1));

    // Someone edits the mirror row post-hoc (tamper). The chain is untouched.
    const rowId = mirror.inserted[0].id;
    const tampered = { ...mirror.rows.get(rowId)!, action: "SNEAKY.delete" };
    mirror.rows.set(rowId, tampered);

    const chainText = fs.files.get(pathFor("p-1")) ?? "";
    const chain: ChainEntry[] = chainText
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ChainEntry);
    const mirrorRows = await mirror.listByProject("p-1");

    const result = reconcileMirror(chain, mirrorRows, mapper);

    // The discrepancy is surfaced as a finding...
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.kind === "mirror_divergence")).toBe(true);
    // ...and the chain is treated as truth (the finding references the stale
    // mirror row, not the authoritative chain entry).
    expect(result.chainIsTruth).toBe(true);
    // The chain entry itself is unchanged by reconciliation.
    expect(chain[0].body.action).toBe("task.update");
  });

  it("a clean mirror (matching the chain) produces no findings", async () => {
    const fs = makeFakeFs();
    const chainQueue = createAppendQueue(fs, pathFor);
    const mirror = makeFakeMirrorDb();
    const dual = createDualWriteQueue(chainQueue, mirror, mapper);

    await dual.append("p-1", body(1));
    await dual.append("p-1", body(2));

    const chainText = fs.files.get(pathFor("p-1")) ?? "";
    const chain: ChainEntry[] = chainText
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ChainEntry);
    const mirrorRows = await mirror.listByProject("p-1");

    const result = reconcileMirror(chain, mirrorRows, mapper);
    expect(result.findings).toHaveLength(0);
    expect(result.chainIsTruth).toBe(true);
  });
});
