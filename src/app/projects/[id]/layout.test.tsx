import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Task 5.1 — Single-project layout provides an "All projects" back-link that
 * returns to the collective dashboard (`/`), so the collective ↔ single
 * navigation model is reversible from every single-project view (spec
 * requirement "Drill-down from collective to single project", scenario
 * "Drill into a project and return": the URL must reflect `/` (collective)).
 *
 * The layout became async in task 5.2 (it now fetches the active project to
 * render its name in the breadcrumb), so this test stubs `@/db` and awaits
 * the layout. The 5.1 contract — an "All projects" link targeting `/` — is
 * unchanged.
 */

const TEST_UUID = "00000000-0000-4000-8000-000000000003";
const projectRow = {
  id: TEST_UUID,
  name: "Some Project",
  description: null,
  rootPath: "/repos/some-project",
  defaultSchema: "spec-driven",
  context: null,
  configYaml: null,
  enrollmentSource: "local",
  remoteGitUrl: null,
  projected: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

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

describe("Single-project layout — 'All projects' back-link (task 5.1)", () => {
  beforeEach(() => {
    RESULTS = [[projectRow]];
  });

  it("renders an 'All projects' link targeting the collective dashboard root `/`", async () => {
    const mod = await import("@/app/projects/[id]/layout");
    const ProjectLayout = mod.default;

    const ui = await ProjectLayout({
      params: Promise.resolve({ id: TEST_UUID }),
      children: <div data-testid="page-body">project page body</div>,
    });
    render(ui);

    const link = screen.getByRole("link", { name: /all projects/i });
    expect(link).toBeTruthy();
    // Must point at the collective dashboard root, not the registry list.
    expect(link.getAttribute("href")).toBe("/");

    // Children are rendered inside the layout.
    expect(screen.getByTestId("page-body")).toBeTruthy();
  });
});
