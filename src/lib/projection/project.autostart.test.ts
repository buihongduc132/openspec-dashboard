/**
 * Task 8.3 — watcher auto-start wiring.
 *
 * Asserts the content-projection spec's watcher requirement at the wiring
 * layer: "A chokidar watcher SHALL ... be started the first time a local
 * project is projected." Concretely, after `projectProject` completes for a
 * local project whose rootPath exists, `WatcherRegistry.startWatch` SHALL be
 * invoked (idempotently — only when not already watching), wiring the
 * debounced file-event callback to re-enqueue a projection.
 *
 * Collaborators (db, scanner, parse-runner, upsert) are mocked so the
 * watcher-start side effect is exercised in isolation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  startWatchCalls: [] as Array<{
    projectId: string;
    rootPath: string;
  }>,
  isWatchingSet: new Set<string>(),
  enqueueCalls: [] as string[],
  onEventFn: null as ((id: string) => void) | null,
}));

vi.mock("@/lib/projection/scanner", () => ({
  scanProjectTree: () => ({ ok: true, files: { specs: [], changes: [], archivedChanges: [] } }),
}));

vi.mock("@/lib/projection/parse-runner", () => ({
  runParsers: () => ({ files: [], issues: [] }),
  readFileSyncUtf8: () => "",
}));

vi.mock("@/lib/projection/upsert", () => ({
  upsertProjectContent: () => Promise.resolve(),
}));

vi.mock("@/lib/projection/watcher", () => ({
  startWatch: (projectId: string, rootPath: string, onEvent: (id: string) => void) => {
    state.startWatchCalls.push({ projectId, rootPath });
    state.onEventFn = onEvent;
    return true;
  },
  isWatching: (projectId: string) => state.isWatchingSet.has(projectId),
}));

vi.mock("@/lib/projection/queue-instance", () => ({
  getProjectionQueue: () => ({
    enqueue: (projectId: string) => {
      state.enqueueCalls.push(projectId);
      return Promise.resolve({ jobId: "j-1", status: "queued" as const, projectId });
    },
  }),
}));

import { projectProject } from "@/lib/projection/project";
import type { ProjectionDb } from "@/lib/projection/upsert";

/** Build a chainable mock db that resolves the project row + absorbs updates. */
function makeMockDb(): ProjectionDb {
  const chain = {
    from() {
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      return chain;
    },
    set() {
      return chain;
    },
    then(onFulfilled: unknown) {
      return Promise.resolve([
        {
          id: "p-autostart",
          rootPath: "/tmp/autostart-root",
          enrollmentSource: "local",
        },
      ]).then(onFulfilled as never);
    },
  };
  const db = {
    select() {
      return chain;
    },
    update() {
      // update().set(...).where(...) resolves to [] (no returning needed).
      const updateChain = {
        set() {
          return updateChain;
        },
        where() {
          return updateChain;
        },
        then(onFulfilled: unknown) {
          return Promise.resolve([]).then(onFulfilled as never);
        },
      };
      return updateChain;
    },
  };
  return db as unknown as ProjectionDb;
}

describe("task 8.3 — watcher auto-start on projectProject completion", () => {
  beforeEach(() => {
    state.startWatchCalls = [];
    state.isWatchingSet = new Set();
    state.enqueueCalls = [];
    state.onEventFn = null;
  });

  it("calls startWatch with the project id + rootPath after a successful local projection", async () => {
    const result = await projectProject("p-autostart", makeMockDb());
    expect(result.projected).toBe(true);
    expect(state.startWatchCalls).toHaveLength(1);
    expect(state.startWatchCalls[0].projectId).toBe("p-autostart");
    expect(state.startWatchCalls[0].rootPath).toBe("/tmp/autostart-root");
  });

  it("does NOT call startWatch again when already watching (idempotent)", async () => {
    state.isWatchingSet.add("p-autostart"); // pretend a watcher already exists
    await projectProject("p-autostart", makeMockDb());
    expect(state.startWatchCalls).toHaveLength(0);
  });

  it("the registered onEvent callback enqueues a re-projection", async () => {
    await projectProject("p-autostart", makeMockDb());
    expect(state.onEventFn).not.toBeNull();
    state.onEventFn!("p-autostart");
    // The onEvent callback enqueues via a dynamic import (to avoid a module
    // cycle); let the microtask resolve before asserting.
    await vi.waitFor(() => {
      expect(state.enqueueCalls).toContain("p-autostart");
    });
  });
});
