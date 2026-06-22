import { describe, it, expect } from "vitest";

/**
 * Task 2.22 — Task velocity (req 7.5).
 *
 * Velocity = tasks completed per day/week. The pure `computeVelocity` helper
 * takes raw audit-log task-completion timestamps and buckets them into a
 * configurable window (last 7 / 30 / 90 days). It is the behavioural core of
 * the burn-up chart; the DB fetcher is a thin wrapper over `auditLogs`.
 *
 * AC 7.5(a): sourced from audit-log completion events (timestamps passed in).
 * AC 7.5(b): configurable window (7/30/90 days) + day/week bucket.
 */
import { computeVelocity } from "./velocity";

const NOW = new Date("2026-06-22T12:00:00Z");

describe("computeVelocity (task 2.22, req 7.5)", () => {
  it("buckets completion timestamps into per-day counts within the window", () => {
    const dates = [
      new Date("2026-06-20T10:00:00Z"),
      new Date("2026-06-20T15:00:00Z"),
      new Date("2026-06-22T08:00:00Z"),
    ];
    const result = computeVelocity(dates, {
      windowDays: 7,
      bucket: "day",
      referenceNow: NOW,
    });
    expect(result.total).toBe(3);
    expect(result.buckets).toHaveLength(7);
    const last = result.buckets[result.buckets.length - 1];
    expect(last.completed).toBe(1); // 2026-06-22
  });

  it("honours the configurable window size (7 / 30 / 90)", () => {
    expect(
      computeVelocity([], { windowDays: 7, referenceNow: NOW }).buckets
    ).toHaveLength(7);
    expect(
      computeVelocity([], { windowDays: 30, referenceNow: NOW }).buckets
    ).toHaveLength(30);
    expect(
      computeVelocity([], { windowDays: 90, referenceNow: NOW }).buckets
    ).toHaveLength(90);
  });

  it("weekly bucket aggregates completions across each 7-day span", () => {
    // All completions happen on "today" so they all land in the most recent
    // weekly bucket (anchored at today). A 28-day window produces 4 buckets.
    const dates = Array.from({ length: 7 }, () => new Date(NOW));
    const result = computeVelocity(dates, {
      windowDays: 28,
      bucket: "week",
      referenceNow: NOW,
    });
    expect(result.total).toBe(7);
    // The most recent weekly bucket holds all 7.
    expect(Math.max(...result.buckets.map((b) => b.completed))).toBe(7);
  });

  it("excludes completion events older than the window", () => {
    const old = new Date("2026-06-01T10:00:00Z"); // well outside a 7-day window
    const result = computeVelocity([old], {
      windowDays: 7,
      bucket: "day",
      referenceNow: NOW,
    });
    expect(result.total).toBe(0);
    expect(result.buckets.every((b) => b.completed === 0)).toBe(true);
  });

  it("returns empty buckets with zero total when no completions are supplied", () => {
    const result = computeVelocity([], {
      windowDays: 7,
      bucket: "day",
      referenceNow: NOW,
    });
    expect(result.total).toBe(0);
    expect(result.buckets.every((b) => b.completed === 0)).toBe(true);
  });
});
