/**
 * Task 2.16 — Change metadata edit + artifact editors (req 03.4, 03.7–03.10).
 *
 *   - PATCH /api/projects/{id}/changes/{changeId}
 *       Edit change metadata (name/description/status/schema) — req 03.4.
 *   - PATCH /api/projects/{id}/changes/{changeId}/artifacts/{type}
 *       Edit an artifact's Markdown content (proposal/design/tasks/delta) —
 *       req 03.7/03.8/03.9/03.10. Auto-updates the artifact's updatedAt.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const CHANGE_ID = "00000000-0000-0000-0000-000000000002";

let RESULTS: unknown[] = [];
let UPDATED: Record<string, unknown> | null = null;
let UPDATE_WHERE: unknown = null;

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
  const updateChain = () => {
    const self = (() => self) as unknown as Record<string, unknown>;
    self.set = (v: Record<string, unknown>) => {
      UPDATED = v;
      return self;
    };
    self.where = (w: unknown) => {
      UPDATE_WHERE = w;
      return self;
    };
    self.returning = () => self;
    self.then = (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve([{ id: "row-1" }]).then(
        onFulfilled as never,
        onRejected as never,
      );
    return self;
  };
  return {
    db: new Proxy({} as Record<string, unknown>, {
      get: (_t, prop) => {
        if (prop === "update") return () => updateChain();
        return () => makeChainable();
      },
    }),
  };
}

vi.mock("@/db", () => mockDb());

describe("PATCH /api/projects/[id]/changes/[changeId] (task 2.16, req 03.4)", () => {
  beforeEach(() => {
    vi.resetModules();
    RESULTS = [];
    UPDATED = null;
    UPDATE_WHERE = null;
  });

  it("returns 404 when the change does not exist", async () => {
    RESULTS = [[]];
    const { PATCH } = await import("@/app/api/projects/[id]/changes/[changeId]/route");
    const res = await PATCH(
      reqWith({ description: "Updated" }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("updates the change metadata and returns 200", async () => {
    RESULTS = [[{ id: CHANGE_ID, projectId: PROJECT_ID }]];
    const { PATCH } = await import("@/app/api/projects/[id]/changes/[changeId]/route");
    const res = await PATCH(
      reqWith({ name: "renamed-change", description: "Updated desc", status: "in-progress" }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(UPDATED).not.toBeNull();
    expect(UPDATED!.name).toBe("renamed-change");
    expect(UPDATED!.description).toBe("Updated desc");
    expect(UPDATED!.status).toBe("in-progress");
    expect(UPDATED!.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects an invalid renamed change name with 400", async () => {
    RESULTS = [[{ id: CHANGE_ID, projectId: PROJECT_ID }]];
    const { PATCH } = await import("@/app/api/projects/[id]/changes/[changeId]/route");
    const res = await PATCH(
      reqWith({ name: "Bad Name" }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/projects/[id]/changes/[changeId]/artifacts/[type] (task 2.16, req 03.7–03.10)", () => {
  beforeEach(() => {
    vi.resetModules();
    RESULTS = [];
    UPDATED = null;
    UPDATE_WHERE = null;
  });

  it("returns 400 for an unsupported artifact type", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/changes/[changeId]/artifacts/[type]/route"
    );
    const res = await PATCH(
      reqWith({ content: "## Why\nbody" }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID, type: "bogus" }) },
    );
    expect(res.status).toBe(400);
  });

  it("upserts the artifact content for proposal (req 03.7)", async () => {
    // Lookup order: change row → existing artifact row → update.
    RESULTS = [
      [{ id: CHANGE_ID, projectId: PROJECT_ID, name: "add-rbac" }],
      [{ id: "art-1", changeId: CHANGE_ID, type: "proposal" }],
    ];
    const { PATCH } = await import(
      "@/app/api/projects/[id]/changes/[changeId]/artifacts/[type]/route"
    );
    const res = await PATCH(
      reqWith({ content: "## Why\nNew proposal body" }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID, type: "proposal" }) },
    );
    expect(res.status).toBe(200);
    expect(UPDATED).not.toBeNull();
    expect(UPDATED!.content).toBe("## Why\nNew proposal body");
  });
});

function reqWith(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/x`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
