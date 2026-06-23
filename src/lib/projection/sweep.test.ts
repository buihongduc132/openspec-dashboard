/**
 * Task 8.1 — `sweepStaleProjects()` suite.
 *
 * Asserts the content-projection spec's "On startup the system SHALL sweep
 * stale projections" requirement:
 *  - local projects with `projected=false` are enqueued;
 *  - local projects whose `lastProjectedAt` is OLDER than the newest file
 *    mtime under `<rootPath>/openspec/` are enqueued;
 *  - fresh projects (`projected=true` and `lastProjectedAt` newer than the
 *    newest mtime) are NOT enqueued;
 *  - remote-git projects are skipped;
 *  - projects whose rootPath is missing are skipped (no enqueue, no throw).
 *
 * All I/O collaborators are mocked so the sweep logic is exercised
 * deterministically.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  // Rows returned by `db.select(...).from(projects)`.
  projectRows: [] as Array<{
    id: string;
    rootPath: string;
    enrollmentSource: string;
    projected: boolean;
    lastProjectedAt: Date | null;
  }>,
  // Map: rootPath -> newest mtime (ms) under openspec/, or null when none.
  newestMtimes: {} as Record<string, number | null>,
  enqueued: [] as string[],
}));

vi.mock("@/db", () => ({
  db: {
    select: () => {
      const self = {
        from() {
          return self;
        },
        then(onFulfilled: unknown, onRejected: unknown) {
          return Promise.resolve(state.projectRows).then(
            onFulfilled as never,
            onRejected as never,
          );
        },
      };
      return self;
    },
  },
}));

vi.mock("@/lib/projection/queue-instance", () => ({
  getProjectionQueue: () => ({
    enqueue: (projectId: string) => {
      state.enqueued.push(projectId);
      return Promise.resolve({
        jobId: `job-${projectId}`,
        status: "queued" as const,
        projectId,
      });
    },
  }),
}));

import { sweepStaleProjects } from "@/lib/projection/sweep";

describe("sweepStaleProjects (task 8.1)", () => {
  beforeEach(() => {
    state.projectRows = [];
    state.newestMtimes = {};
    state.enqueued = [];
  });

  it("enqueues local projects with projected=false", async () => {
    state.projectRows = [
      {
        id: "p1",
        rootPath: "/tmp/r1",
        enrollmentSource: "local",
        projected: false,
        lastProjectedAt: null,
      },
    ];
    state.newestMtimes = { "/tmp/r1": null };
    await sweepStaleProjects({
      newestMtime: (root) => Promise.resolve(state.newestMtimes[root] ?? null),
    });
    expect(state.enqueued).toEqual(["p1"]);
  });

  it("enqueues projects whose lastProjectedAt is older than the newest file mtime", async () => {
    const newest = new Date("2026-06-22T12:00:00Z").getTime();
    state.projectRows = [
      {
        id: "p2",
        rootPath: "/tmp/r2",
        enrollmentSource: "local",
        projected: true,
        lastProjectedAt: new Date("2026-06-01T00:00:00Z"),
      },
    ];
    state.newestMtimes = { "/tmp/r2": newest };
    await sweepStaleProjects({
      newestMtime: (root) => Promise.resolve(state.newestMtimes[root] ?? null),
    });
    expect(state.enqueued).toEqual(["p2"]);
  });

  it("does NOT enqueue fresh projects", async () => {
    const newest = new Date("2026-06-01T00:00:00Z").getTime();
    state.projectRows = [
      {
        id: "p3",
        rootPath: "/tmp/r3",
        enrollmentSource: "local",
        projected: true,
        lastProjectedAt: new Date("2026-06-22T00:00:00Z"),
      },
    ];
    state.newestMtimes = { "/tmp/r3": newest };
    await sweepStaleProjects({
      newestMtime: (root) => Promise.resolve(state.newestMtimes[root] ?? null),
    });
    expect(state.enqueued).toEqual([]);
  });

  it("skips remote-git projects", async () => {
    state.projectRows = [
      {
        id: "p4",
        rootPath: "/tmp/r4",
        enrollmentSource: "remote-git",
        projected: false,
        lastProjectedAt: null,
      },
    ];
    await sweepStaleProjects({
      newestMtime: () => Promise.resolve(null),
    });
    expect(state.enqueued).toEqual([]);
  });

  it("treats lastProjectedAt == newest mtime as fresh (boundary, task 8.5)", async () => {
    // The sweep enqueues only when newest > lastProjectedAt (strict). At the
    // exact boundary the project is fresh, so it must NOT be enqueued.
    const boundary = new Date("2026-06-22T12:00:00Z").getTime();
    state.projectRows = [
      {
        id: "p5",
        rootPath: "/tmp/r5",
        enrollmentSource: "local",
        projected: true,
        lastProjectedAt: new Date(boundary),
      },
    ];
    state.newestMtimes = { "/tmp/r5": boundary };
    await sweepStaleProjects({
      newestMtime: (root) => Promise.resolve(state.newestMtimes[root] ?? null),
    });
    expect(state.enqueued).toEqual([]);
  });

  it("skips projects whose openspec tree is absent (newest mtime null, task 8.5)", async () => {
    // A projected=true project whose rootPath/openspec no longer exists has
    // newest=null; nothing on disk is newer than the last run, so it is NOT
    // enqueued by the mtime branch. (The projection layer separately records
    // the missing-root error on the next explicit re-project.)
    state.projectRows = [
      {
        id: "p6",
        rootPath: "/tmp/gone",
        enrollmentSource: "local",
        projected: true,
        lastProjectedAt: new Date("2026-06-22T00:00:00Z"),
      },
    ];
    state.newestMtimes = { "/tmp/gone": null };
    await sweepStaleProjects({
      newestMtime: (root) => Promise.resolve(state.newestMtimes[root] ?? null),
    });
    expect(state.enqueued).toEqual([]);
  });
});
