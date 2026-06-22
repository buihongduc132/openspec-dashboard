/**
 * Task 4.4 — Spec version history & blame unit tests (req 02 §2.6).
 *
 * Source: `flow/requirements/02-specs.md` §2.6.
 *
 *  - 02.6 AC (a): History comes from `git log`/`git blame` on the underlying
 *    file — NO shadow history. The dashboard only shapes already-emitted git
 *    records; it never invents commits.
 *  - 02.6 AC (b): Restoring a prior version creates a NEW commit (never
 *    rewrites history) via a change+archive path, and is audit-logged.
 *  - Blame maps each requirement/scenario to the commit that last touched it.
 */
import { describe, it, expect } from "vitest";
import {
  computeSpecHistory,
  computeBlame,
  planRestoreVersion,
  type GitLogEntry,
  type GitBlameRegion,
} from "@/lib/specs/history";

// `git log` emits newest-first, so the source array is already in that order.
const COMMITS: GitLogEntry[] = [
  {
    sha: "ccc3333",
    author: "carol",
    date: "2026-06-20T10:00:00Z",
    subject: "Tweak Login body",
  },
  {
    sha: "bbb2222",
    author: "bob",
    date: "2026-06-19T10:00:00Z",
    subject: "Add Logout scenario",
  },
  {
    sha: "aaa1111",
    author: "alice",
    date: "2026-06-18T10:00:00Z",
    subject: "Add Login requirement",
  },
];

describe("computeSpecHistory", () => {
  it("returns history entries shaped from raw git log (no shadow history)", () => {
    const history = computeSpecHistory(COMMITS);
    expect(history).toHaveLength(3);
    // Most-recent first (git log ordering) — AC a.
    expect(history[0].sha).toBe("ccc3333");
    expect(history[0].author).toBe("carol");
    expect(history[2].sha).toBe("aaa1111");
  });

  it("preserves commit sha/author/date/subject verbatim from the source", () => {
    const history = computeSpecHistory(COMMITS);
    for (const [i, commit] of COMMITS.entries()) {
      expect(history[i].sha).toBe(commit.sha);
      expect(history[i].author).toBe(commit.author);
      expect(history[i].date).toBe(commit.date);
      expect(history[i].subject).toBe(commit.subject);
    }
  });

  it("returns an empty list when there is no git history", () => {
    expect(computeSpecHistory([])).toEqual([]);
  });
});

describe("computeBlame", () => {
  const REGIONS: GitBlameRegion[] = [
    // The Login requirement header + body, last touched by ccc3333.
    { sha: "ccc3333", author: "carol", startLine: 1, endLine: 6, requirement: "Login", scenario: null },
    // The Login "Valid login" scenario, added by bbb2222.
    { sha: "bbb2222", author: "bob", startLine: 7, endLine: 11, requirement: "Login", scenario: "Valid login" },
    // A separate "Logout" requirement, added by aaa1111.
    { sha: "aaa1111", author: "alice", startLine: 12, endLine: 18, requirement: "Logout", scenario: null },
  ];

  it("maps each requirement to the commit that last touched it", () => {
    const blame = computeBlame(REGIONS);
    expect(blame.requirements["Login"]?.sha).toBe("ccc3333");
    expect(blame.requirements["Login"]?.author).toBe("carol");
    expect(blame.requirements["Logout"]?.sha).toBe("aaa1111");
  });

  it("maps each scenario to the commit that last touched it", () => {
    const blame = computeBlame(REGIONS);
    expect(blame.scenarios["Login::Valid login"]?.sha).toBe("bbb2222");
    expect(blame.scenarios["Login::Valid login"]?.author).toBe("bob");
  });

  it("scopes the blame key by parent requirement (no flat collisions)", () => {
    const regions: GitBlameRegion[] = [
      { sha: "d1", author: "x", startLine: 1, endLine: 4, requirement: "A", scenario: "Setup" },
      { sha: "d2", author: "y", startLine: 5, endLine: 9, requirement: "B", scenario: "Setup" },
    ];
    const blame = computeBlame(regions);
    expect(blame.scenarios["A::Setup"]?.sha).toBe("d1");
    expect(blame.scenarios["B::Setup"]?.sha).toBe("d2");
  });

  it("returns empty maps when there are no blame regions", () => {
    const blame = computeBlame([]);
    expect(blame.requirements).toEqual({});
    expect(blame.scenarios).toEqual({});
  });
});

describe("planRestoreVersion", () => {
  it("plans a NEW commit restore (never rewrites history)", () => {
    const plan = planRestoreVersion({
      filePath: "openspec/specs/auth/spec.md",
      targetSha: "aaa1111",
      targetDate: "2026-06-18T10:00:00Z",
      changeName: "restore-auth-spec-2026-06-20",
    });
    // AC b: restore creates a new commit — it must NOT rewrite or reset to
    // the target sha. The plan produces a forward change+archive path with
    // the target captured as a content snapshot.
    expect(plan.targetSha).toBe("aaa1111");
    expect(plan.targetShaCherryPicked).toBe(false);
    expect(plan.action).toBe("create-change-from-snapshot");
    expect(plan.changeName).toBe("restore-auth-spec-2026-06-20");
    expect(plan.filePath).toBe("openspec/specs/auth/spec.md");
    expect(plan.auditLogged).toBe(true);
  });

  it("rejects history-rewriting restore strategies", () => {
    const plan = planRestoreVersion({
      filePath: "openspec/specs/auth/spec.md",
      targetSha: "aaa1111",
      targetDate: "2026-06-18T10:00:00Z",
      changeName: "restore-auth-spec",
    });
    // No reset/rebase/cherry-pick-onto strategies allowed.
    expect(plan.action).not.toMatch(/reset|rebase|cherry-pick|force-push/);
  });
});
