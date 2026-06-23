/**
 * Task 5.13 (RED) — One-time backfill of pre-existing `audit_logs` rows into
 * the filesystem chain (change `phase0-foundations`, spec `audit-chain`, req
 * "One-time backfill of pre-existing `audit_logs` rows"; design D0-8).
 *
 *   "A one-time Phase 0 cutover migration SHALL backfill every pre-existing
 *    `audit_logs` row into the filesystem chain, chained from genesis in
 *    `createdAt` order, so no prior history is lost at the cutover. The
 *    migration SHALL be idempotent (re-running it produces no duplicate chain
 *    entries) and SHALL be verified by the chain verifier after completion."
 *
 * Scenarios asserted here (the ones task 5.13 enumerates for the backfill half):
 *  1. Backfill chains pre-existing rows in order — existing `audit_logs` rows
 *     are appended to the filesystem chain from genesis in ascending
 *     `createdAt` order and the verifier reports the resulting chain valid.
 *  2. Backfill is idempotent — running it a second time creates no duplicate
 *     chain entries (already-backfilled rows are detected and skipped).
 */
import { describe, expect, it } from "vitest";
import { createAppendQueue, type AppendQueueFs } from "@/lib/audit/append-queue";
import { GENESIS_HASH, type ChainEntry } from "@/lib/audit/chain";
import { verifyChain } from "@/lib/audit/verifier";
import {
  backfillAuditChain,
  type BackfillMarkerFs,
} from "@/db/migrations/backfill-audit-chain";
import type { AuditMirrorDb, AuditMirrorRow } from "@/lib/audit/postgres-mirror";

/** Pre-existing audit_logs row (the shape already in src/db/schema.ts). */
interface ExistingLogRow {
  id: string;
  projectId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  author: string | null;
  createdAt: number; // epoch ms for deterministic ordering in the fake
}

function makeFakeFs(): AppendQueueFs &
  BackfillMarkerFs & { files: Map<string, string> } {
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
    async writeFile(path, data) {
      files.set(path, data);
    },
  };
}

/** Fake mirror DB seeded with pre-existing audit_logs rows. */
function makeSeededMirror(rows: ExistingLogRow[]): AuditMirrorDb {
  const map = new Map<string, AuditMirrorRow>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      projectId: r.projectId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details ?? undefined,
      author: r.author ?? undefined,
      createdAt: r.createdAt,
    });
  }
  return {
    async insert() {
      throw new Error("insert should not be called during backfill");
    },
    async listByProject(projectId) {
      return [...map.values()]
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },
  };
}

function livePath(projectId: string): string {
  return `/sidecar/${projectId}/audit.log`;
}

function markerPath(projectId: string): string {
  return `/sidecar/${projectId}.backfill.json`;
}

function parseChain(contents: string | undefined): ChainEntry[] {
  return (contents ?? "")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ChainEntry);
}

/** Build pre-existing rows with intentionally UNSORTED createdAt to prove
 *  the migration sorts them into ascending order. */
function preExistingRows(): ExistingLogRow[] {
  return [
    {
      id: "row-3",
      projectId: "p-1",
      action: "task.update",
      entityType: "task",
      entityId: "task:t-3",
      details: null,
      author: "carol",
      createdAt: 1_700_000_000_300, // NEWEST but listed first
    },
    {
      id: "row-1",
      projectId: "p-1",
      action: "spec.create",
      entityType: "spec",
      entityId: "spec:s-1",
      details: null,
      author: "alice",
      createdAt: 1_700_000_000_100, // OLDEST but listed second
    },
    {
      id: "row-2",
      projectId: "p-1",
      action: "change.update",
      entityType: "change",
      entityId: "change:c-1",
      details: null,
      author: "bob",
      createdAt: 1_700_000_000_200, // MIDDLE
    },
    // A row for a DIFFERENT project must not be touched when backfilling p-1.
    {
      id: "row-other",
      projectId: "p-other",
      action: "noop",
      entityType: "x",
      entityId: "x",
      details: null,
      author: "zoe",
      createdAt: 1_700_000_000_000,
    },
  ];
}

describe("backfill-audit-chain — chains pre-existing rows in createdAt order", () => {
  it("appends existing audit_logs rows to an empty chain from genesis in ascending createdAt order", async () => {
    const fs = makeFakeFs();
    const chainQueue = createAppendQueue(fs, livePath);
    const mirror = makeSeededMirror(preExistingRows());

    const result = await backfillAuditChain(
      { chainQueue, mirror, markerPath, markerFs: fs },
      "p-1",
    );

    expect(result.backfilledCount).toBe(3);
    expect(result.skippedCount).toBe(0);

    const chain = parseChain(fs.files.get(livePath("p-1")));
    expect(chain).toHaveLength(3);

    // Ordered by ascending createdAt: row-1, row-2, row-3.
    expect(chain[0].body.actor).toBe("alice");
    expect(chain[0].body.action).toBe("spec.create");
    expect(chain[1].body.actor).toBe("bob");
    expect(chain[2].body.actor).toBe("carol");

    // Anchored at genesis and verified by the chain verifier.
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    expect(verifyChain(chain).valid).toBe(true);

    // The migration reports the post-backfill chain as verified.
    expect(result.verification.valid).toBe(true);
  });

  it("does not backfill rows belonging to other projects", async () => {
    const fs = makeFakeFs();
    const chainQueue = createAppendQueue(fs, livePath);
    const mirror = makeSeededMirror(preExistingRows());

    await backfillAuditChain({ chainQueue, mirror, markerPath, markerFs: fs }, "p-1");

    // p-other's row never landed in p-1's chain.
    const chain = parseChain(fs.files.get(livePath("p-1")));
    expect(chain.every((e) => e.body.actor !== "zoe")).toBe(true);
  });
});

describe("backfill-audit-chain — idempotent", () => {
  it("re-running the migration creates no duplicate chain entries", async () => {
    const fs = makeFakeFs();
    const chainQueue = createAppendQueue(fs, livePath);
    const mirror = makeSeededMirror(preExistingRows());

    const first = await backfillAuditChain(
      { chainQueue, mirror, markerPath, markerFs: fs },
      "p-1",
    );
    expect(first.backfilledCount).toBe(3);

    const second = await backfillAuditChain(
      { chainQueue, mirror, markerPath, markerFs: fs },
      "p-1",
    );
    expect(second.backfilledCount).toBe(0);
    expect(second.skippedCount).toBe(3);

    // The chain still has exactly 3 entries — no duplicates.
    const chain = parseChain(fs.files.get(livePath("p-1")));
    expect(chain).toHaveLength(3);
    expect(verifyChain(chain).valid).toBe(true);
  });
});
