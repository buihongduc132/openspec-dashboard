/**
 * Task 6.2 — read endpoints reflect out-of-band disk edits (api-foundation
 * spec scenario "Reads reflect out-of-band disk edits").
 *
 * List works (task 1.11 tests) and unknown-project 404 (task 1.11 tests) are
 * already pinned. The remaining behaviour this task pins is that the three
 * read routes are NON-cached: a spec file edited on disk + watcher re-project
 * MUST surface on the next GET without a server restart. In Next.js App
 * Router that means each route MUST export `dynamic = "force-dynamic"` so the
 * runtime never serves a stale, statically-generated response.
 */
import { describe, it, expect, vi } from "vitest";

// The route modules transitively import the DB driver, which throws when no
// DATABASE_URL is configured. We are asserting on the static `dynamic`
// export, not DB behaviour, so stub the DB surface.
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: () => () => ({
        from() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return this;
        },
        then() {
          return Promise.resolve([]);
        },
      }),
    },
  ),
}));
vi.mock("@/db/schema", () => ({ projects: {}, specDomains: {}, changes: {}, artifacts: {} }));
vi.mock("@/lib/projection/status-fields", () => ({
  withProjectionStatus: (p: unknown) => p,
}));
vi.mock("@/lib/changes", () => ({
  validateChangeName: () => true,
  scaffoldChange: () => [],
}));

describe("read routes are non-cached (task 6.2)", () => {
  it("GET /api/projects is force-dynamic so OOB edits surface without restart", async () => {
    const mod = await import("@/app/api/projects/route");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("GET /api/projects/[id]/specs is force-dynamic", async () => {
    const mod = await import("@/app/api/projects/[id]/specs/route");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("GET /api/projects/[id]/changes is force-dynamic", async () => {
    const mod = await import("@/app/api/projects/[id]/changes/route");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
