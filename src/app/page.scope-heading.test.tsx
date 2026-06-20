import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Task 2.4 — Add a clear collective-scope heading/breadcrumb ("All projects")
 * so the collective view is never mistaken for a single project.
 *
 * The collective dashboard must signal its scope unambiguously (spec:
 * "a heading or breadcrumb that signals 'all projects'"). We assert the
 * rendered `/` page surfaces a dedicated collective-scope marker distinct
 * from any single project's name.
 */

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

describe("Collective dashboard scope heading (task 2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Empty project list + the two aggregate count queries.
    RESULTS = [[], [{ count: 7 }], [{ count: 13 }]];
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a collective-scope heading that signals 'All projects'", async () => {
    const mod = await import("@/app/page");
    const Page = mod.default;
    const ui = await Page();
    render(ui);

    const scopeHeading = screen.getByTestId("collective-scope");
    expect(scopeHeading).toBeTruthy();

    // The heading must literally signal the collective scope, not one project.
    expect(scopeHeading.textContent ?? "").toMatch(/all projects/i);

    // The scope marker must NOT be accidentally styled as a single project.
    // It is distinct from the collective-overview metrics section.
    const overview = screen.getByTestId("collective-overview");
    expect(overview).not.toBe(scopeHeading);
  });
});
