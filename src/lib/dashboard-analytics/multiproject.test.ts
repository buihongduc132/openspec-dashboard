import { describe, it, expect } from "vitest";

/**
 * Task 7.1 — Multi-project overview (req 7.2).
 *
 * Req 7.2 is the org-level rollup dashboard DISTINCT from req 1.6's single-
 * project cards. It adds cross-project rollups (total active changes, total
 * open validation errors, aggregate task completion %) and a cross-project
 * activity heatmap (AC 7.2b — heatmap of activity by day).
 *
 * The pure helpers below take per-project / per-event inputs and produce the
 * rollup + heatmap — the behavioural core that the DB fetcher wraps.
 */
import {
  computeOrgRollup,
  computeActivityHeatmap,
  type ProjectRollupInput,
} from "./multiproject";

const NOW = new Date("2026-06-22T12:00:00Z");

const projects: ProjectRollupInput[] = [
  {
    id: "p1",
    activeChanges: 3,
    openValidationErrors: 2,
    taskTotal: 10,
    taskDone: 5,
    lastActivityAt: new Date("2026-06-22T10:00:00Z"),
    owner: "alice",
  },
  {
    id: "p2",
    activeChanges: 1,
    openValidationErrors: 0,
    taskTotal: 4,
    taskDone: 4,
    lastActivityAt: new Date("2026-06-20T10:00:00Z"),
    owner: "bob",
  },
];

describe("computeOrgRollup (task 7.1, req 7.2)", () => {
  it("sums active changes and open validation errors across projects", () => {
    const rollup = computeOrgRollup(projects);
    expect(rollup.totalActiveChanges).toBe(4);
    expect(rollup.totalOpenValidationErrors).toBe(2);
    expect(rollup.projectCount).toBe(2);
  });

  it("computes aggregate task completion % across all projects", () => {
    const rollup = computeOrgRollup(projects);
    // total done = 9, total tasks = 14 → 64%
    expect(rollup.aggregateTaskCompletionPct).toBe(64);
  });

  it("aggregate completion % is 0 when there are no tasks", () => {
    const rollup = computeOrgRollup([
      { id: "x", activeChanges: 0, openValidationErrors: 0, taskTotal: 0, taskDone: 0, lastActivityAt: null, owner: null },
    ]);
    expect(rollup.aggregateTaskCompletionPct).toBe(0);
  });
});

describe("computeActivityHeatmap (task 7.1, req 7.2)", () => {
  it("buckets cross-project events into per-day counts over the window", () => {
    const events = [
      { createdAt: new Date("2026-06-22T01:00:00Z") },
      { createdAt: new Date("2026-06-22T05:00:00Z") },
      { createdAt: new Date("2026-06-20T05:00:00Z") },
    ];
    const heatmap = computeActivityHeatmap(events, {
      windowDays: 7,
      referenceNow: NOW,
    });
    expect(heatmap).toHaveLength(7);
    // newest bucket is today (2026-06-22) with 2 events
    const today = heatmap[heatmap.length - 1];
    expect(today.date).toBe("2026-06-22");
    expect(today.count).toBe(2);
    const twoDaysAgo = heatmap[heatmap.length - 3];
    expect(twoDaysAgo.date).toBe("2026-06-20");
    expect(twoDaysAgo.count).toBe(1);
  });

  it("zero-fills buckets with no events", () => {
    const heatmap = computeActivityHeatmap([], {
      windowDays: 3,
      referenceNow: NOW,
    });
    expect(heatmap).toHaveLength(3);
    expect(heatmap.every((c) => c.count === 0)).toBe(true);
  });
});
