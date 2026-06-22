/**
 * Task 4.2 / req 03.16 — Archive browsing & restore.
 *
 * Pure tests for the archive-browse helper:
 *   - Filter by date range (inclusive) and substring name match.
 *   - Full-text content search.
 *   - Chronological sort (newest first by archived date).
 */
import { describe, it, expect } from "vitest";
import { browseArchive } from "@/lib/change-richness/archive";
import type { ArchivedChange } from "@/lib/change-richness/types";

const ARCHIVE: ArchivedChange[] = [
  {
    name: "add-login",
    archivedDate: "2026-01-05",
    content: "## Why\nUser can log in via email.\n## ADDED Requirements\n### Requirement: Login",
  },
  {
    name: "fix-profile",
    archivedDate: "2026-02-12",
    content: "## Why\nProfile page was broken.\n## MODIFIED Requirements\n### Requirement: Profile",
  },
  {
    name: "cleanup-old-tasks",
    archivedDate: "2026-03-30",
    content: "## Why\nArchive stale task rows.\n",
  },
];

describe("Task 4.2 / req 03.16 — Archive browsing", () => {
  it("returns chronological (newest first) when no filters apply", () => {
    const r = browseArchive(ARCHIVE, {});
    expect(r.map((a) => a.name)).toEqual([
      "cleanup-old-tasks",
      "fix-profile",
      "add-login",
    ]);
  });

  it("filters by inclusive date range", () => {
    const r = browseArchive(ARCHIVE, { from: "2026-02-01", to: "2026-02-28" });
    expect(r.map((a) => a.name)).toEqual(["fix-profile"]);
  });

  it("filters by name substring (case-insensitive)", () => {
    const r = browseArchive(ARCHIVE, { name: "LOGIN" });
    expect(r.map((a) => a.name)).toEqual(["add-login"]);
  });

  it("searches archived content full-text (03.16)", () => {
    const r = browseArchive(ARCHIVE, { query: "Profile page was broken" });
    expect(r.map((a) => a.name)).toEqual(["fix-profile"]);
  });

  it("combines date + name + query filters", () => {
    const r = browseArchive(ARCHIVE, {
      from: "2026-01-01",
      to: "2026-12-31",
      name: "login",
      query: "email",
    });
    expect(r.map((a) => a.name)).toEqual(["add-login"]);
  });

  it("returns empty when no matches", () => {
    const r = browseArchive(ARCHIVE, { name: "does-not-exist" });
    expect(r).toEqual([]);
  });
});
