// Task 4.2 / 5.2 — projection scanner.
//
// scanProjectTree(rootPath) walks `<rootPath>/openspec/` and returns a typed
// tree of artifact locations (specs, active changes, archived changes, tasks,
// config). Non-existent roots are skipped with an explicit reason rather than
// throwing (content-projection spec: "Project whose rootPath does not exist").
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProjectTree } from "@/lib/projection/scanner";

function fixtureTree(root: string) {
  const ospec = path.join(root, "openspec");
  mkdirSync(path.join(ospec, "specs", "auth"), { recursive: true });
  mkdirSync(path.join(ospec, "specs", "billing"), { recursive: true });
  writeFileSync(path.join(ospec, "specs", "auth", "spec.md"), "# auth\n");
  writeFileSync(path.join(ospec, "specs", "billing", "spec.md"), "# billing\n");

  // active change with proposal, design, tasks, and one delta spec
  const changeDir = path.join(ospec, "changes", "add-login");
  mkdirSync(path.join(changeDir, "specs", "auth"), { recursive: true });
  writeFileSync(path.join(changeDir, "proposal.md"), "## Why\n");
  writeFileSync(path.join(changeDir, "design.md"), "## Context\n");
  writeFileSync(path.join(changeDir, "tasks.md"), "- [ ] one\n");
  writeFileSync(path.join(changeDir, "specs", "auth", "spec.md"), "## ADDED\n");

  // archived change
  const archiveDir = path.join(ospec, "changes", "archive", "2024-01-01-old-thing");
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(path.join(archiveDir, "proposal.md"), "## Why\n");
  writeFileSync(path.join(archiveDir, "tasks.md"), "- [x] done\n");

  // config
  writeFileSync(path.join(ospec, "config.yaml"), "defaultSchema: spec-driven\n");

  return ospec;
}

describe("task 4.2/5.2 — scanProjectTree", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "scan-"));
    fixtureTree(root);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns ok with the expected top-level fields for a real tree", () => {
    const res = scanProjectTree(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rootPath).toBe(root);
    expect(Array.isArray(res.specs)).toBe(true);
    expect(Array.isArray(res.changes)).toBe(true);
    expect(Array.isArray(res.archivedChanges)).toBe(true);
    expect(typeof res.tasksByChange).toBe("object");
  });

  it("discovers main specs by capability directory name", () => {
    const res = scanProjectTree(root);
    if (!res.ok) throw new Error("expected ok");
    const caps = res.specs.map((s) => s.capability).sort();
    expect(caps).toEqual(["auth", "billing"]);
    for (const s of res.specs) {
      expect(existsSync(s.path)).toBe(true);
    }
  });

  it("lists active changes (excluding archive) with their artifacts", () => {
    const res = scanProjectTree(root);
    if (!res.ok) throw new Error("expected ok");
    expect(res.changes.map((c) => c.name)).toEqual(["add-login"]);
    const c = res.changes[0];
    expect(c.archived).toBe(false);
    expect(existsSync(c.dir)).toBe(true);
    expect(c.proposalPath && existsSync(c.proposalPath)).toBe(true);
    expect(c.designPath && existsSync(c.designPath)).toBe(true);
    expect(c.tasksPath && existsSync(c.tasksPath)).toBe(true);
    expect(c.deltaSpecs.map((d) => d.domain)).toEqual(["auth"]);
    expect(existsSync(c.deltaSpecs[0].path)).toBe(true);
  });

  it("lists archived changes under changes/archive/ marked archived=true", () => {
    const res = scanProjectTree(root);
    if (!res.ok) throw new Error("expected ok");
    expect(res.archivedChanges.map((c) => c.name)).toEqual(["2024-01-01-old-thing"]);
    expect(res.archivedChanges[0].archived).toBe(true);
  });

  it("builds tasksByChange for active and archived changes", () => {
    const res = scanProjectTree(root);
    if (!res.ok) throw new Error("expected ok");
    const keys = Object.keys(res.tasksByChange).sort();
    expect(keys).toEqual(["2024-01-01-old-thing", "add-login"]);
    expect(res.tasksByChange["add-login"].archived).toBe(false);
    expect(res.tasksByChange["2024-01-01-old-thing"].archived).toBe(true);
    expect(existsSync(res.tasksByChange["add-login"].path)).toBe(true);
  });

  it("locates config.yaml at the openspec root", () => {
    const res = scanProjectTree(root);
    if (!res.ok) throw new Error("expected ok");
    expect(res.configYamlPath).not.toBeNull();
    expect(existsSync(res.configYamlPath as string)).toBe(true);
  });

  it("returns ok with empty arrays when openspec/ exists but is empty", () => {
    const emptyRoot = mkdtempSync(path.join(tmpdir(), "scan-empty-"));
    try {
      mkdirSync(path.join(emptyRoot, "openspec"), { recursive: true });
      const res = scanProjectTree(emptyRoot);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.specs).toEqual([]);
      expect(res.changes).toEqual([]);
      expect(res.archivedChanges).toEqual([]);
      expect(res.configYamlPath).toBeNull();
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("skips a non-existent rootPath with an explicit reason and does not throw", () => {
    const res = scanProjectTree(path.join(root, "does-not-exist"));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBeTruthy();
    expect(res.reason.toLowerCase()).toContain("not");
    expect(res.rootPath).toBe(path.join(root, "does-not-exist"));
  });

  it("skips a rootPath that has no openspec/ directory", () => {
    const bare = mkdtempSync(path.join(tmpdir(), "scan-bare-"));
    try {
      const res = scanProjectTree(bare);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.reason).toBeTruthy();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
