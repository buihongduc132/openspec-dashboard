import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Task 5.2 — Single-project view clearly shows the active project name as a
 * breadcrumb, so the single-project scope is visually distinct from the
 * collective overview (spec requirement "Drill-down from collective to single
 * project", scenario "Single-project view signals its scope": the UI clearly
 * shows which project is active — name + breadcrumb — and is visually
 * distinct from the collective overview).
 *
 * The layout renders BOTH the "All projects" back-link (task 5.1) AND the
 * active project name in a breadcrumb trail, so the user always sees
 * "All projects › <ProjectName>" while inside a single-project view.
 */

const projectRow = {
  id: "proj-1",
  name: "My Tracked Project",
  description: null,
  rootPath: "/repos/my-project",
  defaultSchema: "spec-driven",
  context: null,
  configYaml: null,
  enrollmentSource: "local",
  remoteGitUrl: null,
  projected: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

// Chainable thenable DB stub (same pattern as page.test.tsx).
let RESULTS: unknown[] = [];
function makeChainable(): Record<string, unknown> {
  const chain = (() => chain) as unknown as Record<string, unknown>;
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(RESULTS.shift() ?? []).then(
      onFulfilled as never,
      onRejected as never,
    );
  for (const m of ["select", "from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) {
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
    throw new Error("notFound() should not be called — project exists");
  },
}));

describe("Single-project layout — active project name breadcrumb (task 5.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    RESULTS = [[projectRow]];
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the active project name alongside the 'All projects' back-link as a breadcrumb", async () => {
    const mod = await import("@/app/projects/[id]/layout");
    const ProjectLayout = mod.default;

    const ui = await ProjectLayout({
      params: Promise.resolve({ id: "proj-1" }),
      children: <div data-testid="page-body">project page body</div>,
    });
    render(ui);

    // The "All projects" back-link (task 5.1) is still present.
    const allProjectsLink = screen.getByRole("link", { name: /all projects/i });
    expect(allProjectsLink).toBeTruthy();
    expect(allProjectsLink.getAttribute("href")).toBe("/");

    // The active project name is rendered in the same breadcrumb region.
    expect(screen.getByText("My Tracked Project")).toBeTruthy();

    // The breadcrumb region is labelled so the scope is explicit.
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeTruthy();
    expect(nav.contains(allProjectsLink)).toBe(true);

    // Children still render.
    expect(screen.getByTestId("page-body")).toBeTruthy();
  });
});
