/**
 * Task 7.3 — GET /api/projects and GET /api/projects/:id expose projection
 * status fields.
 *
 * The projection-status spec requires that every project object returned by
 * the list/detail endpoints carries `projected`, `lastProjectedAt`, and a
 * derived `parseErrors` array. The underlying DB row has a `projectionError`
 * TEXT column that may hold either a JSON array of parse-issue objects or a
 * bare skip-reason string; the route layer must translate the JSON form into
 * `parseErrors: ParseIssue[]` and fall back to `[]` for bare strings.
 *
 * RED: before task 7.3 the route returns the raw `projectionError` field but
 * does NOT synthesize `parseErrors`, so these assertions fail.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  projectRows: [] as unknown[],
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
          return Promise.resolve(state.projectRows).then(
            onFulfilled as never,
            onRejected as never,
          );
        },
      };
      return self;
    },
  },
}));

describe("GET /api/projects (task 7.3)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.projectRows = [];
  });

  it("includes projected, lastProjectedAt, and parseErrors derived from JSON projectionError", async () => {
    state.projectRows = [
      {
        id: "p1",
        name: "proj1",
        rootPath: "/tmp/r1",
        enrollmentSource: "local",
        projected: true,
        lastProjectedAt: new Date("2026-06-22T12:00:00Z"),
        projectionError: JSON.stringify([
          { file: "specs/auth/spec.md", line: 5, severity: "warn", message: "meh" },
        ]),
      },
    ];
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    const row = body[0];
    expect(row.projected).toBe(true);
    expect(row.lastProjectedAt).toBe("2026-06-22T12:00:00.000Z");
    expect(row.parseErrors).toEqual([
      { file: "specs/auth/spec.md", line: 5, severity: "warn", message: "meh" },
    ]);
  });

  it("returns parseErrors=[] when projectionError is null", async () => {
    state.projectRows = [
      {
        id: "p2",
        name: "proj2",
        rootPath: "/tmp/r2",
        enrollmentSource: "local",
        projected: true,
        lastProjectedAt: new Date("2026-06-22T10:00:00Z"),
        projectionError: null,
      },
    ];
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body[0].parseErrors).toEqual([]);
  });

  it("returns parseErrors=[] when projectionError holds a bare skip-reason string", async () => {
    state.projectRows = [
      {
        id: "p3",
        name: "proj3",
        rootPath: "/tmp/r3",
        enrollmentSource: "local",
        projected: false,
        lastProjectedAt: null,
        projectionError: "rootPath does not exist",
      },
    ];
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body[0].parseErrors).toEqual([]);
  });

  it("exposes projected=false and parseErrors=[] for un-projected remote-git projects", async () => {
    state.projectRows = [
      {
        id: "p4",
        name: "remote",
        rootPath: "/tmp/r4",
        enrollmentSource: "remote-git",
        remoteGitUrl: "https://github.com/x/y",
        projected: false,
        lastProjectedAt: null,
        projectionError: null,
      },
    ];
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body[0].projected).toBe(false);
    expect(body[0].lastProjectedAt).toBeNull();
    expect(body[0].parseErrors).toEqual([]);
  });
});

describe("GET /api/projects/:id (task 7.3)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.projectRows = [];
  });

  it("returns 404 for an unknown project", async () => {
    state.projectRows = [];
    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/projects/missing") as never,
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns projected, lastProjectedAt, and parseErrors for a known project", async () => {
    state.projectRows = [
      {
        id: "pA",
        name: "projA",
        rootPath: "/tmp/rA",
        enrollmentSource: "local",
        projected: true,
        lastProjectedAt: new Date("2026-06-22T09:00:00Z"),
        projectionError: JSON.stringify([
          { file: "changes/foo/tasks.md", severity: "warn", message: "bad" },
        ]),
      },
    ];
    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/projects/pA") as never,
      { params: Promise.resolve({ id: "pA" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.projected).toBe(true);
    expect(body.lastProjectedAt).toBe("2026-06-22T09:00:00.000Z");
    expect(body.parseErrors).toEqual([
      { file: "changes/foo/tasks.md", severity: "warn", message: "bad" },
    ]);
  });
});
