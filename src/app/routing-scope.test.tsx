import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

/**
 * Task 5.3 — Verify the collective URL is `/` and single-project is
 * `/projects/[id]/*` (no scope bleed).
 *
 * The spec (design D-MPCD-6) defines two explicit navigation scopes:
 *
 *   - `collective` lives at `/` and is the aggregated multi-project overview.
 *   - `single-project` lives at `/projects/[id]/*`.
 *
 * "No scope bleed" means each scope owns its own scope marker and the two
 * never appear together on the same surface:
 *
 *   - The collective `/` page renders the `collective-scope` marker and must
 *     NOT render the single-project `active-project-name` breadcrumb.
 *   - Every `/projects/[id]/*` page renders the `active-project-name`
 *     breadcrumb (via the single-project layout) and must NOT render the
 *     `collective-scope` marker.
 *   - The single-project "All projects" affordance must target `/` (the
 *     collective dashboard), not `/projects` (the registry list) — so the URL
 *     contract holds and the navigation model is reversible.
 *
 * These are scope-level invariants, so we render both surfaces side by side
 * and assert the markers are mutually exclusive.
 */

// --- Shared chainable DB stub ----------------------------------------------
let RESULTS: unknown[] = [];
function makeChainable(): Record<string, unknown> {
  const chain = (() => chain) as unknown as Record<string, unknown>;
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(RESULTS.shift() ?? []).then(
      onFulfilled as never,
      onRejected as never,
    );
  for (const m of [
    "select",
    "from",
    "where",
    "limit",
    "orderBy",
    "innerJoin",
    "leftJoin",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}
vi.mock("@/db", () => ({
  db: new Proxy({} as Record<string, unknown>, {
    get: () => () => makeChainable(),
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound() should not be called");
  },
}));

const singleProjectRow = {
  id: "proj-1",
  name: "Solo Tracked Project",
  description: null,
  rootPath: "/repos/solo",
  defaultSchema: "spec-driven",
  context: null,
  configYaml: null,
  enrollmentSource: "local",
  remoteGitUrl: null,
  projected: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("Collective ↔ single-project scope routing (task 5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    // Reset the queue so a leftover from one test doesn't poison another.
    RESULTS = [];
  });

  it("the collective `/` page carries the collective-scope marker, not the single-project one", async () => {
    // Collective page awaits: projects orderBy -> [], in-flight count, open
    // tasks count (empty project list ⇒ no per-project queries run).
    RESULTS = [[], [{ count: 7 }], [{ count: 13 }]];

    const mod = await import("@/app/page");
    const ui = await mod.default();
    render(ui);

    // Collective scope is asserted by the dedicated marker.
    expect(screen.getByTestId("collective-scope")).toBeTruthy();

    // No single-project scope bleed: the active-project-name breadcrumb is a
    // single-project concern and must NOT appear on the collective page.
    expect(screen.queryByTestId("active-project-name")).toBeNull();
  });

  it("the single-project layout carries the single-project marker, not the collective one", async () => {
    // The layout awaits the single project row.
    RESULTS = [[singleProjectRow]];

    const mod = await import("@/app/projects/[id]/layout");
    const ui = await mod.default({
      params: Promise.resolve({ id: "proj-1" }),
      children: <div data-testid="page-body">project body</div>,
    });
    render(ui);

    // Single-project scope is asserted by the active-project-name breadcrumb.
    expect(screen.getByTestId("active-project-name")).toBeTruthy();

    // No collective scope bleed: the collective-scope marker must NOT appear
    // on a single-project surface.
    expect(screen.queryByTestId("collective-scope")).toBeNull();
  });

  it("the single-project 'All projects' back-link targets the collective dashboard root `/`, not the registry list `/projects`", async () => {
    RESULTS = [[singleProjectRow]];

    const mod = await import("@/app/projects/[id]/layout");
    const ui = await mod.default({
      params: Promise.resolve({ id: "proj-1" }),
      children: <div data-testid="page-body">project body</div>,
    });
    render(ui);

    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    const allProjectsLink = within(breadcrumb).getByRole("link", {
      name: /all projects/i,
    });

    // The URL contract: the collective dashboard is at `/`, so leaving a
    // single-project view returns to the collective root — never to a
    // registry-style list. `/projects` would be scope bleed into the
    // project-registry scope (design D-MPCD-6 only allows the two scopes).
    expect(allProjectsLink.getAttribute("href")).toBe("/");
    expect(allProjectsLink.getAttribute("href")).not.toBe("/projects");
  });
});
