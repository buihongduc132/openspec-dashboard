/**
 * Task 1.11 — `GET /api/projects/{id}/changes` read endpoint (req 08 §8.1, plan §0.5).
 *
 * Returns the changes registered for a single project. Phase-0 skeleton:
 * read-only. A nonexistent project returns 404.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

/** Results queue shared across every `db.select()` in a single test run. */
let RESULTS: unknown[] = [];

function mockDb() {
  const makeChainable = () => {
    const self = (() => self) as unknown as Record<string, unknown>;
    self.then = (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve(RESULTS.shift() ?? []).then(
        onFulfilled as never,
        onRejected as never,
      );
    for (const m of ["from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) {
      self[m] = () => self;
    }
    return self;
  };
  return {
    db: new Proxy({} as Record<string, unknown>, {
      get: () => () => makeChainable(),
    }),
  };
}

describe("GET /api/projects/[id]/changes — read endpoint (task 1.11)", () => {
  beforeEach(() => {
    vi.resetModules();
    RESULTS = [];
  });

  it("returns 404 when the project does not exist", async () => {
    RESULTS = [[]];
    vi.doMock("@/db", mockDb);
    const { GET } = await import("@/app/api/projects/[id]/changes/route");
    const res = await GET(reqWith(PROJECT_ID), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns the project's changes as JSON", async () => {
    const projectRow = [{ id: PROJECT_ID, name: "demo" }];
    const changeRows = [
      { id: "c1", projectId: PROJECT_ID, name: "build-mvp", status: "in-flight" },
      { id: "c2", projectId: PROJECT_ID, name: "add-rbac", status: "proposed" },
    ];
    RESULTS = [projectRow, changeRows];
    vi.doMock("@/db", mockDb);
    const { GET } = await import("@/app/api/projects/[id]/changes/route");
    const res = await GET(reqWith(PROJECT_ID), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(changeRows);
  });
});

/* ─── test helpers ────────────────────────────────────────────────────────── */

function reqWith(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${id}/changes`, { method: "GET" });
}
