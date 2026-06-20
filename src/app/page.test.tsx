import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Task 2.1 — Reframe `src/app/page.tsx`: the leading section is cross-project
 * aggregation (project count, total in-flight changes, total open tasks).
 *
 * We mock @/db with an ordered results queue and assert the rendered collective
 * overview surfaces the three aggregated counts before any per-project content.
 */

// Ordered exactly as the page awaits them:
//   1) projects orderBy               -> []
//   2) in-flight changes count         -> [{ count: 7 }]
//   3) open tasks count                -> [{ count: 13 }]
// (empty project list ⇒ no per-project queries run)
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

describe("Collective dashboard leading aggregation (task 2.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    RESULTS = [[], [{ count: 7 }], [{ count: 13 }]];
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the cross-project aggregation as the leading section", async () => {
    const mod = await import("@/app/page");
    const Page = mod.default;
    const ui = await Page();
    render(ui);

    // The collective overview leads with the three aggregated counts.
    const overview = screen.getByTestId("collective-overview");
    expect(overview).toBeTruthy();
    expect(overview.textContent ?? "").toContain("0");
    expect(overview.textContent ?? "").toContain("7");
    expect(overview.textContent ?? "").toContain("13");
    // Labelling makes the scope unambiguous ("all projects" collective).
    expect(overview.textContent ?? "").toMatch(/project/i);
    expect(overview.textContent ?? "").toMatch(/in[\s-]?flight/i);
    expect(overview.textContent ?? "").toMatch(/open task/i);
  });
});
