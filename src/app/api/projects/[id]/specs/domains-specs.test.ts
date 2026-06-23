/**
 * Task 6.3 — `GET /api/projects/[id]/specs` reads spec domains AND their specs
 * from the in-memory projection (api-foundation spec: "list spec domains +
 * specs for a project"). The projection upsert layer (task 4.4) populates both
 * the `spec_domains` and `specs` tables; the read route MUST surface the
 * nested specs so consumers see the projected content, not just the domain
 * shells. Reads reflect out-of-band disk edits because the route is
 * force-dynamic (task 6.2) and reads the projection-populated tables live.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

/** Sequential results queue for the mocked DB chain. */
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

describe("GET /api/projects/[id]/specs — domains + specs (task 6.3)", () => {
  beforeEach(() => {
    vi.resetModules();
    RESULTS = [];
  });

  it("returns each domain with its projection-populated specs nested", async () => {
    const projectRow = [{ id: PROJECT_ID, name: "demo" }];
    const domains = [
      { id: "d1", projectId: PROJECT_ID, name: "dashboard-foundation", purpose: "engine" },
    ];
    const specs = [
      { id: "s1", domainId: "d1", content: "# Dashboard Foundation", contentHash: "h1" },
    ];
    RESULTS = [projectRow, domains, specs];
    vi.doMock("@/db", mockDb);
    const { GET } = await import("@/app/api/projects/[id]/specs/route");
    const res = await GET(reqWith(PROJECT_ID), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("d1");
    expect(Array.isArray(body[0].specs)).toBe(true);
    expect(body[0].specs[0]).toMatchObject({ id: "s1", content: "# Dashboard Foundation" });
  });
});

function reqWith(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${id}/specs`, { method: "GET" });
}
