import { describe, it, expect } from "vitest";

/**
 * Task 7.1 — Archive analytics (req 7.6).
 *
 * Req 7.6: archive frequency, average change duration (creation → archive),
 * most-modified spec domains across archives. AC 7.6(b): "slowest changes"
 * leaderboard to surface bottlenecks. AC 7.6(a): sourced from archived
 * changes (creation + archive timestamps, touched domains passed in).
 */
import {
  computeArchiveAnalytics,
  type ArchiveChangeInput,
} from "./archive";

const baseChange = (
  over: Partial<ArchiveChangeInput> & { changeId: string; changeName: string; projectId: string }
): ArchiveChangeInput => ({
  createdAt: new Date("2026-06-01T00:00:00Z"),
  archivedAt: new Date("2026-06-11T00:00:00Z"),
  domainIds: [],
  ...over,
});

describe("computeArchiveAnalytics (task 7.1, req 7.6)", () => {
  it("computes average change duration (creation → archive) in days", () => {
    const result = computeArchiveAnalytics([
      baseChange({ changeId: "c1", changeName: "a", projectId: "p1" }), // 10 days
      baseChange({
        changeId: "c2",
        changeName: "b",
        projectId: "p1",
        createdAt: new Date("2026-06-01T00:00:00Z"),
        archivedAt: new Date("2026-06-16T00:00:00Z"), // 15 days
      }),
    ]);
    expect(result.averageChangeDurationDays).toBe(12.5); // (10+15)/2
  });

  it("buckets archive frequency by month (UTC yyyy-mm)", () => {
    const result = computeArchiveAnalytics([
      baseChange({
        changeId: "c1",
        changeName: "a",
        projectId: "p1",
        archivedAt: new Date("2026-06-11T00:00:00Z"),
      }),
      baseChange({
        changeId: "c2",
        changeName: "b",
        projectId: "p1",
        archivedAt: new Date("2026-06-20T00:00:00Z"),
      }),
      baseChange({
        changeId: "c3",
        changeName: "c",
        projectId: "p1",
        archivedAt: new Date("2026-05-05T00:00:00Z"),
      }),
    ]);
    const byMonth = Object.fromEntries(
      result.archiveFrequency.map((m) => [m.month, m.count])
    );
    expect(byMonth["2026-06"]).toBe(2);
    expect(byMonth["2026-05"]).toBe(1);
  });

  it("produces a slowest-changes leaderboard sorted descending by duration", () => {
    const result = computeArchiveAnalytics([
      baseChange({ changeId: "fast", changeName: "fast", projectId: "p1", archivedAt: new Date("2026-06-02T00:00:00Z") }),
      baseChange({ changeId: "slow", changeName: "slow", projectId: "p1", archivedAt: new Date("2026-06-30T00:00:00Z") }),
    ]);
    expect(result.slowestChanges[0].changeId).toBe("slow");
    expect(result.slowestChanges[1].changeId).toBe("fast");
    expect(result.slowestChanges[0].durationDays).toBeGreaterThanOrEqual(
      result.slowestChanges[1].durationDays
    );
  });

  it("ranks most-modified spec domains across archives", () => {
    const result = computeArchiveAnalytics([
      baseChange({ changeId: "c1", changeName: "a", projectId: "p1", domainIds: ["d1", "d2"] }),
      baseChange({ changeId: "c2", changeName: "b", projectId: "p1", domainIds: ["d1", "d3"] }),
      baseChange({ changeId: "c3", changeName: "c", projectId: "p1", domainIds: ["d1"] }),
    ]);
    expect(result.mostModifiedDomains[0]).toEqual({ domainId: "d1", archiveCount: 3 });
  });

  it("returns zeroed metrics for an empty input", () => {
    const result = computeArchiveAnalytics([]);
    expect(result.averageChangeDurationDays).toBe(0);
    expect(result.archiveFrequency).toEqual([]);
    expect(result.slowestChanges).toEqual([]);
    expect(result.mostModifiedDomains).toEqual([]);
  });
});
