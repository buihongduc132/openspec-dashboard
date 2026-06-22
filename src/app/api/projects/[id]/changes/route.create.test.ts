/**
 * Task 2.16 — `POST /api/projects/{id}/changes` — change creation (req 03.3).
 *
 * Creates a new change row with a kebab-case, uniqueness-checked name, plus
 * the scaffolded canonical artifacts (proposal/design/tasks) that pass
 * `openspec validate` immediately (AC (a)).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

let RESULTS: unknown[] = [];
/** Ordered captures of every `db.insert(table).values(...)` payload. */
let INSERTS: Record<string, unknown>[] = [];

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
  const insertChain = () => {
    const self = (() => self) as unknown as Record<string, unknown>;
    self.values = (v: Record<string, unknown> | Record<string, unknown>[]) => {
      INSERTS.push(...(Array.isArray(v) ? v : [v]));
      return self;
    };
    self.returning = () => self;
    self.then = (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve([{ id: "new-1", name: "add-rbac", projectId: PROJECT_ID }]).then(
        onFulfilled as never,
        onRejected as never,
      );
    return self;
  };
  return {
    db: new Proxy({} as Record<string, unknown>, {
      get: (_t, prop) => {
        if (prop === "insert") return () => insertChain();
        return () => makeChainable();
      },
    }),
  };
}

vi.mock("@/db", () => mockDb());

describe("POST /api/projects/[id]/changes (task 2.16)", () => {
  beforeEach(() => {
    vi.resetModules();
    RESULTS = [];
    INSERTS = [];
  });

  it("returns 404 when the project does not exist", async () => {
    RESULTS = [[]];
    const { POST } = await import("@/app/api/projects/[id]/changes/route");
    const res = await POST(reqWith({ name: "add-rbac" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 for a duplicate change name", async () => {
    RESULTS = [
      [{ id: PROJECT_ID }], // project exists
      [{ id: "existing-change" }], // name already taken
    ];
    const { POST } = await import("@/app/api/projects/[id]/changes/route");
    const res = await POST(reqWith({ name: "add-rbac" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 for an invalid (non-kebab) change name", async () => {
    RESULTS = [[{ id: PROJECT_ID }]];
    const { POST } = await import("@/app/api/projects/[id]/changes/route");
    const res = await POST(reqWith({ name: "Add RBAC" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a change + scaffolded artifacts and returns 201", async () => {
    RESULTS = [
      [{ id: PROJECT_ID }], // project exists
      [], // name unique
    ];
    const { POST } = await import("@/app/api/projects/[id]/changes/route");
    const res = await POST(
      reqWith({ name: "add-rbac", description: "Add RBAC", schema: "spec-driven" }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(res.status).toBe(201);
    // First insert is the change row.
    const changeInsert = INSERTS.find((i) => i.name === "add-rbac");
    expect(changeInsert).toBeDefined();
    expect(changeInsert!.projectId).toBe(PROJECT_ID);
    // Scaffolded canonical artifacts inserted.
    const artifactTypes = INSERTS.map((i) => i.type).filter(Boolean).sort();
    expect(artifactTypes).toEqual(["design", "proposal", "tasks"]);
  });
});

function reqWith(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/changes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
