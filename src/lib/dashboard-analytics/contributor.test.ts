import { describe, it, expect } from "vitest";

/**
 * Task 7.1 — Contributor analytics (req 7.7).
 *
 * Req 7.7: per-user metrics — tasks completed, changes archived, specs
 * authored, validation errors introduced vs resolved. AC 7.7(a): attribution
 * from audit log; an "Unattributed" bucket for CLI-only actions (null author).
 * AC 7.7(b): privacy-respecting configurable anonymity mode for display.
 */
import {
  computeContributorStats,
  type ContributorEventInput,
} from "./contributor";

function ev(
  author: string | null,
  action: ContributorEventInput["action"],
  count = 1
): ContributorEventInput[] {
  return Array.from({ length: count }, () => ({ author, action }));
}

describe("computeContributorStats (task 7.1, req 7.7)", () => {
  it("aggregates per-author counts across the four action families", () => {
    const events: ContributorEventInput[] = [
      ...ev("alice", "task.completed", 3),
      ...ev("alice", "change.archived", 1),
      ...ev("alice", "spec.authored", 2),
      ...ev("alice", "validation.error.introduced", 1),
      ...ev("alice", "validation.error.resolved", 4),
    ];
    const [alice] = computeContributorStats(events);
    expect(alice.author).toBe("alice");
    expect(alice.tasksCompleted).toBe(3);
    expect(alice.changesArchived).toBe(1);
    expect(alice.specsAuthored).toBe(2);
    expect(alice.validationErrorsIntroduced).toBe(1);
    expect(alice.validationErrorsResolved).toBe(4);
  });

  it("buckets null-author events under Unattributed (AC 7.7a)", () => {
    const events: ContributorEventInput[] = [
      ...ev(null, "task.completed", 2),
    ];
    const [anon] = computeContributorStats(events);
    expect(anon.author).toBe("Unattributed");
    expect(anon.tasksCompleted).toBe(2);
  });

  it("ignores leading/trailing whitespace and empty authors when bucketing", () => {
    const events: ContributorEventInput[] = [
      { author: "  alice  ", action: "task.completed" },
      { author: "", action: "task.completed" },
    ];
    const stats = computeContributorStats(events);
    const alice = stats.find((s) => s.author === "alice");
    expect(alice?.tasksCompleted).toBe(1);
    const unattributed = stats.find((s) => s.author === "Unattributed");
    expect(unattributed?.tasksCompleted).toBe(1);
  });

  it("anonymity mode replaces author handles with stable pseudonyms (AC 7.7b)", () => {
    const events: ContributorEventInput[] = [
      ...ev("alice", "task.completed", 1),
      ...ev("bob", "change.archived", 1),
      ...ev("alice", "change.archived", 1),
    ];
    const stats = computeContributorStats(events, { anonymous: true });
    const names = stats.map((s) => s.author);
    // Same original author → same pseudonym (stable), distinct from others.
    const aliceRows = stats.filter(
      (s) => s.tasksCompleted === 1 && s.changesArchived === 1
    );
    expect(aliceRows).toHaveLength(1);
    expect(names.every((n) => n.startsWith("Contributor"))).toBe(true);
    expect(new Set(names).size).toBe(2); // two distinct pseudonyms
  });
});
