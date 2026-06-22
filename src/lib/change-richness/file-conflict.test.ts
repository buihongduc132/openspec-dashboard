/**
 * Task 4.3 / req 06 §6.4b — File-level conflict detection.
 *
 * Pure tests for the file-level conflict detector. At archive time, concurrent
 * edits to the same `specs/<domain>.md` across the selected set are detected
 * by comparing the pre-archive main-spec content hash vs each change's
 * expected base hash. Mismatches surface as conflicts that must be resolved
 * before any of the conflicting changes can archive (6.4b AC c).
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.4b.
 */
import { describe, it, expect } from "vitest";
import { detectFileConflicts } from "@/lib/change-richness/file-conflict";
import type { FileConflictChangeInput } from "@/lib/change-richness/types";

/** Build a change input that touches `domains` with the given base hashes. */
function change(
  name: string,
  baseHashes: Record<string, string>,
): FileConflictChangeInput {
  return { name, baseHashes };
}

describe("Task 4.3 / req 06.4b — File-level conflict detection", () => {
  it("returns no conflicts when every change's expected base hash matches the current main spec", () => {
    const mainSpecHashes = {
      auth: "hash-auth-v3",
      schemas: "hash-schemas-v1",
    };
    const changes = [
      change("add-login", { auth: "hash-auth-v3" }),
      change("add-schemas", { schemas: "hash-schemas-v1" }),
    ];

    const report = detectFileConflicts(changes, mainSpecHashes);

    expect(report.conflicts).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("flags a change whose expected base hash diverged from the current main spec", () => {
    // The main spec for `auth` evolved from v3 → v4 after change A was pinned.
    // `schemas` is still at v1, so the second change is clean and must NOT
    // contribute a conflict.
    const mainSpecHashes = {
      auth: "hash-auth-v4",
      schemas: "hash-schemas-v1",
    };
    const changes = [
      change("add-login", { auth: "hash-auth-v3" }), // stale
      change("tweak-schemas", { schemas: "hash-schemas-v1" }), // clean
    ];

    const report = detectFileConflicts(changes, mainSpecHashes);

    expect(report.clean).toBe(false);
    expect(report.conflicts).toHaveLength(1);
    const c = report.conflicts[0]!;
    expect(c.change).toBe("add-login");
    expect(c.domain).toBe("auth");
    expect(c.expectedBaseHash).toBe("hash-auth-v3");
    expect(c.currentMainHash).toBe("hash-auth-v4");
  });

  it("surfaces two conflicts when two changes are stale on the same domain", () => {
    const mainSpecHashes = { auth: "hash-auth-v5" };
    const changes = [
      change("change-a", { auth: "hash-auth-v3" }),
      change("change-b", { auth: "hash-auth-v4" }),
    ];

    const report = detectFileConflicts(changes, mainSpecHashes);

    expect(report.clean).toBe(false);
    expect(report.conflicts.map((c) => c.change).sort()).toEqual([
      "change-a",
      "change-b",
    ]);
    // Both conflicts share the same domain + current main hash.
    for (const c of report.conflicts) {
      expect(c.domain).toBe("auth");
      expect(c.currentMainHash).toBe("hash-auth-v5");
    }
  });

  it("blocks archive when any conflict is present (6.4b AC c)", () => {
    const mainSpecHashes = { auth: "hash-auth-v2" };
    const changes = [change("stale", { auth: "hash-auth-v1" })];

    const report = detectFileConflicts(changes, mainSpecHashes);

    expect(report.canArchive).toBe(false);
  });

  it("allows archive when there are no conflicts (6.4b AC c)", () => {
    const mainSpecHashes = { auth: "hash-auth-v2" };
    const changes = [change("fresh", { auth: "hash-auth-v2" })];

    const report = detectFileConflicts(changes, mainSpecHashes);

    expect(report.canArchive).toBe(true);
  });

  it("treats a domain present in a change but absent from the main spec as a conflict (domain was removed)", () => {
    // Change A was pinned against `auth`, but the main spec no longer carries
    // that domain (it was archived/removed upstream) — diverged base.
    const mainSpecHashes = {}; // no `auth`
    const changes = [change("add-login", { auth: "hash-auth-v1" })];

    const report = detectFileConflicts(changes, mainSpecHashes);

    expect(report.clean).toBe(false);
    const c = report.conflicts[0]!;
    expect(c.change).toBe("add-login");
    expect(c.domain).toBe("auth");
    expect(c.currentMainHash).toBeNull();
  });

  it("returns no conflicts for an empty change set", () => {
    const report = detectFileConflicts([], { auth: "hash-auth-v1" });
    expect(report.conflicts).toEqual([]);
    expect(report.canArchive).toBe(true);
  });

  it("deterministically orders conflicts by (change, domain)", () => {
    const mainSpecHashes = {
      auth: "h2",
      schemas: "h2",
    };
    const changes = [
      change("zebra", { auth: "h1", schemas: "h1" }),
      change("alpha", { auth: "h1" }),
    ];

    const report = detectFileConflicts(changes, mainSpecHashes);

    const keys = report.conflicts.map((c) => `${c.change}/${c.domain}`);
    // Sorted: alpha/auth, zebra/auth, zebra/schemas.
    expect(keys).toEqual(["alpha/auth", "zebra/auth", "zebra/schemas"]);
  });
});
