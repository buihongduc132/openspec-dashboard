import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We need to re-import per test to pick up process.env changes, so we use
// dynamic imports. Helpers:

const REPO_ROOT = process.cwd();

describe("enrollment allow-list", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    // Clone so we can mutate without affecting other suites
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("getEnrollRoots", () => {
    it("returns repo root + ~/Documents/Projects when env is unset", async () => {
      const { getEnrollRoots } = await import("@/lib/enrollment");
      const roots = getEnrollRoots();
      expect(roots).toContain(REPO_ROOT);
      // ~/Documents/Projects should be expanded to an absolute path
      const home = process.env.HOME || process.env.USERPROFILE || "";
      if (home) {
        expect(roots).toContain(`${home}/Documents/Projects`);
      }
    });

    it("splits the env var on ':' and returns those roots", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/a:/opt/b";
      const { getEnrollRoots } = await import("@/lib/enrollment");
      const roots = getEnrollRoots();
      expect(roots).toEqual(["/opt/a", "/opt/b"]);
    });

    it("ignores empty segments from trailing/leading/double colons", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/a::/opt/b:";
      const { getEnrollRoots } = await import("@/lib/enrollment");
      expect(getEnrollRoots()).toEqual(["/opt/a", "/opt/b"]);
    });

    it("expands a leading '~' to the user's home directory", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "~/code";
      const { getEnrollRoots } = await import("@/lib/enrollment");
      const home = process.env.HOME || process.env.USERPROFILE || "";
      if (home) {
        expect(getEnrollRoots()).toEqual([`${home}/code`]);
      }
    });

    it("returns a single-element array when env contains one path", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/single/path";
      const { getEnrollRoots } = await import("@/lib/enrollment");
      expect(getEnrollRoots()).toEqual(["/single/path"]);
    });
  });

  describe("isPathAllowed", () => {
    it("returns true when path is exactly an allowed root", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/a:/opt/b";
      const { isPathAllowed } = await import("@/lib/enrollment");
      expect(isPathAllowed("/opt/a")).toBe(true);
      expect(isPathAllowed("/opt/b")).toBe(true);
    });

    it("returns true when path is a descendant of an allowed root", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/projects";
      const { isPathAllowed } = await import("@/lib/enrollment");
      expect(isPathAllowed("/opt/projects/myrepo")).toBe(true);
      expect(isPathAllowed("/opt/projects/deep/nested/repo")).toBe(true);
    });

    it("returns false when path is outside all allowed roots", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/projects";
      const { isPathAllowed } = await import("@/lib/enrollment");
      expect(isPathAllowed("/etc/passwd")).toBe(false);
      expect(isPathAllowed("/opt/other")).toBe(false);
    });

    it("does NOT allow prefix-only matches (opt/projects2 is not under opt/projects)", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/projects";
      const { isPathAllowed } = await import("@/lib/enrollment");
      expect(isPathAllowed("/opt/projects2")).toBe(false);
      expect(isPathAllowed("/opt/projectscopy")).toBe(false);
    });

    it("rejects paths with traversal that escape the root", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/projects";
      const { isPathAllowed } = await import("@/lib/enrollment");
      expect(isPathAllowed("/opt/projects/foo/../../etc/passwd")).toBe(false);
    });

    it("handles relative paths by resolving against cwd", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = REPO_ROOT;
      const { isPathAllowed } = await import("@/lib/enrollment");
      // A relative path inside REPO_ROOT
      expect(isPathAllowed("./src")).toBe(true);
      // A relative path that escapes
      expect(isPathAllowed("../outside")).toBe(false);
    });

    it("returns false for empty path", async () => {
      process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = "/opt/a";
      const { isPathAllowed } = await import("@/lib/enrollment");
      expect(isPathAllowed("")).toBe(false);
    });
  });
});
