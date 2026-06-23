/**
 * Task 7.1 — `POST /api/projects/:id/project` route suite.
 *
 * Asserts the content-projection spec's "Manual re-project endpoint SHALL be
 * non-blocking" requirement:
 *  - 404 for an unknown project;
 *  - 409 for a remote-git project (no projection until git integration);
 *  - 202 with `{ jobId, status, projectId }` for a local project, enqueuing
 *    via the projection queue exactly once.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Hoisted mutable state shared between the mock factories and the tests.
 * `vi.mock` factories are hoisted above imports, so they must close over
 * hoisted bindings — not over `let` declared later in the file.
 */
const state = vi.hoisted(() => ({
  projectRow: [] as unknown[],
  enqueueResult: null as {
    jobId: string;
    status: "queued" | "running";
    projectId: string;
  } | null,
  enqueueCalls: 0,
  /** When set, `enqueue` ignores `enqueueResult` and drives this state machine. */
  coalesceMode: false as boolean,
  inFlightJobId: null as string | null,
  enqueueResponses: [] as Array<{
    jobId: string;
    status: "queued" | "running";
    projectId: string;
  }>,
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
          return Promise.resolve(state.projectRow).then(
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
    enqueue: () => {
      state.enqueueCalls += 1;
      if (state.coalesceMode) {
        // Simulate the real queue's per-project coalescing: the first call
        // mints a jobId; subsequent calls while in-flight resolve with the
        // SAME jobId (and a "running" status once the worker has kicked off).
        if (!state.inFlightJobId) {
          state.inFlightJobId = `coalesced-${state.enqueueCalls}`;
          const r = {
            jobId: state.inFlightJobId,
            status: "queued" as const,
            projectId: PROJECT_ID,
          };
          state.enqueueResponses.push(r);
          return Promise.resolve(r);
        }
        const r = {
          jobId: state.inFlightJobId,
          status: "running" as const,
          projectId: PROJECT_ID,
        };
        state.enqueueResponses.push(r);
        return Promise.resolve(r);
      }
      return Promise.resolve(state.enqueueResult);
    },
  }),
}));

describe("POST /api/projects/[id]/project (task 7.1)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.projectRow = [];
    state.enqueueResult = null;
    state.enqueueCalls = 0;
    state.coalesceMode = false;
    state.inFlightJobId = null;
    state.enqueueResponses = [];
  });

  it("returns 404 when the project does not exist", async () => {
    state.projectRow = [];
    const { POST } = await import("@/app/api/projects/[id]/project/route");
    const res = await POST(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(404);
    expect(state.enqueueCalls).toBe(0);
  });

  it("returns 409 for a remote-git project and does not enqueue", async () => {
    state.projectRow = [{ id: PROJECT_ID, enrollmentSource: "remote-git" }];
    const { POST } = await import("@/app/api/projects/[id]/project/route");
    const res = await POST(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(409);
    expect(state.enqueueCalls).toBe(0);
    const body = await res.json();
    expect(body.error).toMatch(/remote/i);
  });

  it("returns 202 + { jobId, status, projectId } for a local project and enqueues once", async () => {
    state.projectRow = [{ id: PROJECT_ID, enrollmentSource: "local" }];
    state.enqueueResult = { jobId: "job-123", status: "queued", projectId: PROJECT_ID };
    const { POST } = await import("@/app/api/projects/[id]/project/route");
    const res = await POST(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) });
    expect(res.status).toBe(202);
    expect(state.enqueueCalls).toBe(1);
    const body = await res.json();
    expect(body).toEqual({ jobId: "job-123", status: "queued", projectId: PROJECT_ID });
  });

  it("coalesces concurrent requests: both get 202 with the same jobId (task 7.4)", async () => {
    // content-projection spec: "Concurrent re-project requests coalesce" —
    // two POSTs for the same project while a job is in-flight SHALL both
    // return 202 with the SAME jobId. The route delegates every request to
    // the queue; the queue decides coalescing. This test pins the route's
    // faithful delegation + 202-on-coalesce behavior.
    state.projectRow = [{ id: PROJECT_ID, enrollmentSource: "local" }];
    state.coalesceMode = true;
    const { POST } = await import("@/app/api/projects/[id]/project/route");
    const [resA, resB] = await Promise.all([
      POST(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) }),
      POST(reqWith(), { params: Promise.resolve({ id: PROJECT_ID }) }),
    ]);
    expect(resA.status).toBe(202);
    expect(resB.status).toBe(202);
    expect(state.enqueueCalls).toBe(2);
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    // Both responses carry the SAME coalesced jobId.
    expect(bodyA.jobId).toBe(bodyB.jobId);
    expect(bodyA.jobId).toBe(state.inFlightJobId);
    expect(bodyA.projectId).toBe(PROJECT_ID);
    expect(bodyB.projectId).toBe(PROJECT_ID);
  });
});

function reqWith(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/project`, {
    method: "POST",
  });
}
