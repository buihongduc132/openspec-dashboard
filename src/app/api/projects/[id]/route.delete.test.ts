/**
 * Task 8.4 — `DELETE /api/projects/:id` wires watcher stop on project delete.
 *
 * Asserts the content-projection spec's watcher requirement: "On project
 * deletion, the watcher SHALL be closed and removed from the registry, and no
 * further events for that root SHALL fire." Concretely, the DELETE handler
 * SHALL:
 *  - return 404 when the project does not exist (and SHALL NOT touch the
 *    watcher registry);
 *  - delete the project row and call `WatcherRegistry.stopWatch(projectId)`
 *    exactly once when the project exists.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-0000000000de";

const state = vi.hoisted(() => ({
  /** Rows returned by the mocked delete chain. */
  deletedRows: [] as unknown[],
  stopWatchCalls: [] as string[],
}));

vi.mock("@/db", () => ({
  db: {
    delete: () => {
      const self = {
        from() {
          return self;
        },
        where() {
          return self;
        },
        returning() {
          return self;
        },
        then(onFulfilled: unknown, onRejected: unknown) {
          return Promise.resolve(state.deletedRows).then(
            onFulfilled as never,
            onRejected as never,
          );
        },
      };
      return self;
    },
  },
}));

vi.mock("@/lib/projection/watcher", () => ({
  stopWatch: (projectId: string) => {
    state.stopWatchCalls.push(projectId);
    return Promise.resolve();
  },
}));

describe("DELETE /api/projects/[id] (task 8.4 — watcher stop on delete)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.deletedRows = [];
    state.stopWatchCalls = [];
  });

  it("returns 404 when the project does not exist and does not stop a watcher", async () => {
    state.deletedRows = []; // delete returned no row
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(reqWith(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
    expect(state.stopWatchCalls).toHaveLength(0);
  });

  it("deletes the project and calls stopWatch(projectId) exactly once", async () => {
    state.deletedRows = [{ id: PROJECT_ID }];
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(reqWith(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(204);
    expect(state.stopWatchCalls).toEqual([PROJECT_ID]);
  });
});

function reqWith(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
    method: "DELETE",
  });
}
