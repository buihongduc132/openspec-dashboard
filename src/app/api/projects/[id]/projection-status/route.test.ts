/**
 * Task 7.2 — `GET /api/projects/:id/projection-status` route suite.
 *
 * Asserts the projection-status spec's "A dedicated status endpoint SHALL
 * return detailed projection state" requirement:
 *  - 404 for unknown project;
 *  - 200 with `{ projectId, projected, lastProjectedAt, currentJob, parseErrors }`
 *    for an existing project;
 *  - `currentJob` reflects running / idle / null as appropriate;
 *  - `parseErrors` derived from the project's `projectionError` JSON.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

const state = vi.hoisted(() => ({
  projectRow: null as {
    id: string;
    enrollmentSource: string;
    projected: boolean;
    lastProjectedAt: Date | null;
    projectionError: string | null;
  } | null,
  jobStatus: null as {
    jobId: string;
    status: "queued" | "running" | "idle" | "failed";
    startedAt: Date | null;
  } | null,
}));

vi.mock("@/db", () => ({
  db: {
    select: () => {
      const self = {
        from() {
          return self;
        },
        where() {
          return self;
        },
        limit() {
          return self;
        },
        then(onFulfilled: unknown, onRejected: unknown) {
          return Promise.resolve(state.projectRow ? [state.projectRow] : []).then(
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
    getStatus: () => state.jobStatus,
  }),
}));

describe("GET /api/projects/[id]/projection-status (task 7.2)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.projectRow = null;
    state.jobStatus = null;
  });

  it("returns 404 for unknown project", async () => {
    const { GET } = await import("@/app/api/projects/[id]/projection-status/route");
    const res = await GET(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with currentJob=null for an idle freshly projected project", async () => {
    state.projectRow = {
      id: PROJECT_ID,
      enrollmentSource: "local",
      projected: true,
      lastProjectedAt: new Date("2026-06-22T12:00:00Z"),
      projectionError: null,
    };
    state.jobStatus = null;
    const { GET } = await import("@/app/api/projects/[id]/projection-status/route");
    const res = await GET(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectId).toBe(PROJECT_ID);
    expect(body.projected).toBe(true);
    expect(body.currentJob).toBeNull();
    expect(body.parseErrors).toEqual([]);
    expect(body.lastProjectedAt).toBe("2026-06-22T12:00:00.000Z");
  });

  it("returns currentJob with status=running when a job is in-flight", async () => {
    state.projectRow = {
      id: PROJECT_ID,
      enrollmentSource: "local",
      projected: true,
      lastProjectedAt: new Date("2026-06-22T12:00:00Z"),
      projectionError: null,
    };
    state.jobStatus = {
      jobId: "job-xyz",
      status: "running",
      startedAt: new Date("2026-06-22T12:01:00Z"),
    };
    const { GET } = await import("@/app/api/projects/[id]/projection-status/route");
    const res = await GET(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentJob).toEqual({
      jobId: "job-xyz",
      status: "running",
      startedAt: "2026-06-22T12:01:00.000Z",
    });
  });

  it("derives parseErrors from projectionError JSON", async () => {
    state.projectRow = {
      id: PROJECT_ID,
      enrollmentSource: "local",
      projected: true,
      lastProjectedAt: new Date("2026-06-22T12:00:00Z"),
      projectionError: JSON.stringify([
        { file: "specs/auth/spec.md", line: 12, severity: "warn", message: "oops" },
      ]),
    };
    const { GET } = await import("@/app/api/projects/[id]/projection-status/route");
    const res = await GET(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parseErrors).toHaveLength(1);
    expect(body.parseErrors[0].file).toBe("specs/auth/spec.md");
  });

  it("returns 200 with projected=false and currentJob=null for a remote-git project (task 7.5)", async () => {
    // projection-status spec: "A request for a remote-git project SHALL
    // return 200 with projected=false and a currentJob of null." Remote
    // projects are never projected (git integration deferred), and no job is
    // ever enqueued for them.
    state.projectRow = {
      id: PROJECT_ID,
      enrollmentSource: "remote-git",
      projected: false,
      lastProjectedAt: null,
      projectionError: null,
    };
    state.jobStatus = null;
    const { GET } = await import("@/app/api/projects/[id]/projection-status/route");
    const res = await GET(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projected).toBe(false);
    expect(body.lastProjectedAt).toBeNull();
    expect(body.currentJob).toBeNull();
    expect(body.parseErrors).toEqual([]);
  });
});

function reqWith(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/projection-status`, {
    method: "GET",
  });
}
