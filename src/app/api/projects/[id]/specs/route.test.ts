/**
 * Task 1.11 — `GET /api/projects/{id}/specs` read endpoint (req 08 §8.1, plan §0.5).
 *
 * Returns the spec domains registered for a single project. Phase-0 skeleton:
 * read-only, mirrors the data the existing `/projects/[id]/specs` page already
 * renders. A nonexistent project returns 404 (so consumers can rely on the
 * status code rather than guessing from an empty array).
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

describe("GET /api/projects/[id]/specs — read endpoint (task 1.11)", () => {
  beforeEach(() => {
    vi.resetModules();
    RESULTS = [];
  });

  it("returns 404 when the project does not exist", async () => {
    RESULTS = [[]]; // project lookup → empty
    vi.doMock("@/db", mockDb);
    const { GET } = await import("@/app/api/projects/[id]/specs/route");
    const res = await GET(reqWith(PROJECT_ID), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns the project's spec domains as JSON", async () => {
    const projectRow = [{ id: PROJECT_ID, name: "demo" }];
    const domains = [
      { id: "d1", projectId: PROJECT_ID, name: "dashboard-foundation", purpose: "engine" },
      { id: "d2", projectId: PROJECT_ID, name: "tasks-kanban", purpose: "board" },
    ];
    RESULTS = [projectRow, domains];
    vi.doMock("@/db", mockDb);
    const { GET } = await import("@/app/api/projects/[id]/specs/route");
    const res = await GET(reqWith(PROJECT_ID), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(domains);
  });

  it("rejects direct main-spec mutations with 405 (req 02 §2.3 — propose-via-change only)", async () => {
    RESULTS = [[{ id: PROJECT_ID, name: "demo" }]];
    vi.doMock("@/db", mockDb);
    const { POST } = await import("@/app/api/projects/[id]/specs/route");
    const res = await POST(
      new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/specs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: "x", content: "hacked" }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toMatch(/change/i);
  });
});

/* ─── test helpers ────────────────────────────────────────────────────────── */

function reqWith(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${id}/specs`, { method: "GET" });
}
