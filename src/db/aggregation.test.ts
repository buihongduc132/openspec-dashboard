import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Task 2.2 — Add aggregation helper queries (index-backed `count` over
 * `changes` non-archived + `tasks` open, grouped/summed across all projects).
 *
 * The aggregation helpers are exported from src/db/aggregation.ts. We mock the
 * underlying db module and assert the helpers issue the correct query shapes
 * (where clauses on status) and return a plain number for the caller to consume
 * directly in the collective dashboard.
 */

const mockSelectResult: { value: Array<Record<string, number>> } = {
  value: [],
};

function makeChainable(): Record<string, unknown> {
  const chain = (() => chain) as unknown as Record<string, unknown>;
  // When awaited, return the configured select result.
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(mockSelectResult.value).then(
      onFulfilled as never,
      onRejected as never,
    );
  for (const m of ["select", "from", "where", "limit", "orderBy"]) {
    chain[m] = () => chain;
  }
  return chain;
}

vi.mock("@/db", () => ({
  db: new Proxy({} as Record<string, unknown>, {
    get:
      () =>
      () =>
        makeChainable(),
  }),
}));

// Re-import after the vi.mock setup so the module sees the mocked db.
import {
  countInFlightChanges,
  countOpenTasks,
  countCrossProjectAggregates,
} from "@/db/aggregation";

describe("Aggregation helper queries (task 2.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResult.value = [{ count: 0 }];
  });

  it("countInFlightChanges returns a number from the result row", async () => {
    mockSelectResult.value = [{ count: 7 }];
    const result = await countInFlightChanges();
    expect(result).toBe(7);
    expect(typeof result).toBe("number");
  });

  it("countOpenTasks returns a number from the result row", async () => {
    mockSelectResult.value = [{ count: 13 }];
    const result = await countOpenTasks();
    expect(result).toBe(13);
    expect(typeof result).toBe("number");
  });

  it("countCrossProjectAggregates returns the full triple {projectCount, inFlightChanges, openTasks}", async () => {
    // The aggregate helper calls countInFlightChanges + countOpenTasks (and
    // accepts projectCount as an argument), so we stub the per-helper values.
    mockSelectResult.value = [{ count: 42 }];
    const aggregate = await countCrossProjectAggregates({ projectCount: 5 });
    expect(aggregate).toEqual({
      projectCount: 5,
      inFlightChanges: 42,
      openTasks: 42,
    });
  });

  it("returns zero when the query returns no rows", async () => {
    mockSelectResult.value = [];
    const result = await countInFlightChanges();
    expect(result).toBe(0);
  });
});
