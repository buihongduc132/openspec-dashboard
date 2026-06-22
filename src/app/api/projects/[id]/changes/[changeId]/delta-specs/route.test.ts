/**
 * Task 2.14 — `POST /api/projects/{id}/changes/{changeId}/delta-specs` (req 02).
 *
 * The propose-via-change flow: every proposed requirement mutation appends a
 * delta-spec section to a change with the appropriate verb
 * (ADDED / MODIFIED / REMOVED / RENAMED). Direct main-spec edits are never
 * performed here (req 02 §2.3 AC (a)).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const CHANGE_ID = "00000000-0000-0000-0000-000000000002";

/** Ordered results queue consumed by every awaited `db.*` call. */
let RESULTS: unknown[] = [];

/** Captured insert payload so we can assert the serialized delta content. */
let INSERTED: Record<string, unknown> | null = null;

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
    self.values = (v: Record<string, unknown>) => {
      INSERTED = v;
      return self;
    };
    self.returning = () => self;
    self.then = (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve([{ id: "delta-1", ...INSERTED }]).then(
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

describe("POST /api/projects/[id]/changes/[changeId]/delta-specs (task 2.14)", () => {
  beforeEach(() => {
    vi.resetModules();
    RESULTS = [];
    INSERTED = null;
  });

  it("returns 404 when the change does not exist", async () => {
    RESULTS = [[]]; // change lookup returns empty
    vi.doMock("@/db", mockDb);
    const { POST } = await import(
      "@/app/api/projects/[id]/changes/[changeId]/delta-specs/route"
    );
    const res = await POST(reqWith(), {
      params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for an unknown verb", async () => {
    RESULTS = [[{ id: CHANGE_ID, projectId: PROJECT_ID }]];
    vi.doMock("@/db", mockDb);
    const { POST } = await import(
      "@/app/api/projects/[id]/changes/[changeId]/delta-specs/route"
    );
    const res = await POST(
      reqWith({ domain: "project-workspace", verb: "UPSERT", requirement: { title: "X", body: "y" } }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/verb/i);
  });

  it("returns 400 when the requirement title is missing", async () => {
    RESULTS = [[{ id: CHANGE_ID, projectId: PROJECT_ID }]];
    vi.doMock("@/db", mockDb);
    const { POST } = await import(
      "@/app/api/projects/[id]/changes/[changeId]/delta-specs/route"
    );
    const res = await POST(
      reqWith({ domain: "project-workspace", verb: "ADDED", requirement: { title: "  ", body: "y" } }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  it("inserts a delta_spec row with deltaType=verb and serialized markdown, returns 201", async () => {
    RESULTS = [
      [{ id: CHANGE_ID, projectId: PROJECT_ID }],
      [{ id: "d1", projectId: PROJECT_ID, name: "project-workspace" }],
    ];
    vi.doMock("@/db", mockDb);
    const { POST } = await import(
      "@/app/api/projects/[id]/changes/[changeId]/delta-specs/route"
    );
    const res = await POST(
      reqWith({
        domain: "project-workspace",
        verb: "ADDED",
        requirement: {
          title: "Config editor",
          body: "The dashboard SHALL expose project config for editing.",
          scenarios: [],
        },
      }),
      { params: Promise.resolve({ id: PROJECT_ID, changeId: CHANGE_ID }) },
    );
    expect(res.status).toBe(201);
    expect(INSERTED).not.toBeNull();
    expect(INSERTED!.changeId).toBe(CHANGE_ID);
    expect(INSERTED!.deltaType).toBe("ADDED");
    expect(String(INSERTED!.content)).toContain("## ADDED Requirements");
    expect(String(INSERTED!.content)).toContain("### Requirement: Config editor");
    const body = await res.json();
    expect(body.id).toBe("delta-1");
  });
});

/* ─── test helpers ────────────────────────────────────────────────────────── */

function reqWith(body?: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/changes/${CHANGE_ID}/delta-specs`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}
