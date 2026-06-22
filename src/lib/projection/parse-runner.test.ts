// Task 4.3 — projection parse-runner.
//
// The parse-runner consumes a {@link ScanResult} and runs the appropriate
// parser entry point per discovered file, collecting `{ model, issues, hash }`
// per file. It never throws on a single bad file — issues are accumulated
// (design D5) so one malformed artifact does not blank the whole project.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProjectTree } from "@/lib/projection/scanner";
import { runParsers, readFileSyncUtf8 } from "@/lib/projection/parse-runner";

function fixtureTree(root: string) {
  const ospec = path.join(root, "openspec");
  mkdirSync(path.join(ospec, "specs", "auth"), { recursive: true });
  writeFileSync(
    path.join(ospec, "specs", "auth", "spec.md"),
    [
      "## Requirements",
      "",
      "### Requirement: Login",
      "Users can log in.",
      "",
      "#### Scenario: Happy path",
      "- WHEN valid creds",
      "- THEN a session is created",
      "",
    ].join("\n"),
  );

  const changeDir = path.join(ospec, "changes", "add-login");
  mkdirSync(path.join(changeDir, "specs", "auth"), { recursive: true });
  writeFileSync(path.join(changeDir, "proposal.md"), "## Why\n");
  writeFileSync(path.join(changeDir, "design.md"), "## Context\n");
  writeFileSync(
    path.join(changeDir, "tasks.md"),
    ["- [x] First", "- [ ] Second", "  - [ ] Sub", ""].join("\n"),
  );
  writeFileSync(
    path.join(changeDir, "specs", "auth", "spec.md"),
    ["## ADDED Requirements", "", "### Requirement: Token", "issue a token", ""].join("\n"),
  );

  writeFileSync(path.join(ospec, "config.yaml"), "defaultSchema: spec-driven\ntools:\n  - claude\n");
}

describe("task 4.3 — runParsers", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "parse-"));
    fixtureTree(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("produces one ParsedFile per discovered artifact with a content hash", () => {
    const scan = scanProjectTree(root);
    if (!scan.ok) throw new Error("scan should succeed");
    const res = runParsers(scan, readFileSyncUtf8);

    // 1 spec + 1 delta + 1 tasks + 1 config = 4 files
    expect(res.files).toHaveLength(4);
    for (const f of res.files) {
      expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(Array.isArray(f.issues)).toBe(true);
    }
  });

  it("parses main specs into a MainSpecModel with requirements + scenarios", () => {
    const scan = scanProjectTree(root);
    if (!scan.ok) throw new Error("scan should succeed");
    const res = runParsers(scan, readFileSyncUtf8);
    const spec = res.files.find((f) => f.kind === "spec");
    if (!spec || spec.kind !== "spec") throw new Error("missing spec file");
    expect(spec.model.capability).toBe("auth");
    expect(spec.model.requirements).toHaveLength(1);
    expect(spec.model.requirements[0].name).toBe("Login");
    expect(spec.model.requirements[0].scenarios).toHaveLength(1);
  });

  it("parses delta specs into a DeltaPlan with the right change/domain tagging", () => {
    const scan = scanProjectTree(root);
    if (!scan.ok) throw new Error("scan should succeed");
    const res = runParsers(scan, readFileSyncUtf8);
    const delta = res.files.find((f) => f.kind === "delta");
    if (!delta || delta.kind !== "delta") throw new Error("missing delta file");
    expect(delta.changeName).toBe("add-login");
    expect(delta.archived).toBe(false);
    expect(delta.domain).toBe("auth");
    expect(delta.plan.added).toHaveLength(1);
    expect(delta.plan.added[0].name).toBe("Token");
  });

  it("parses tasks into ordered TaskItem objects with nesting", () => {
    const scan = scanProjectTree(root);
    if (!scan.ok) throw new Error("scan should succeed");
    const res = runParsers(scan, readFileSyncUtf8);
    const tasks = res.files.find((f) => f.kind === "tasks");
    if (!tasks || tasks.kind !== "tasks") throw new Error("missing tasks file");
    expect(tasks.changeName).toBe("add-login");
    expect(tasks.items).toHaveLength(2);
    expect(tasks.items[0].checked).toBe(true);
    expect(tasks.items[1].children).toHaveLength(1);
  });

  it("parses config.yaml into a ConfigModel", () => {
    const scan = scanProjectTree(root);
    if (!scan.ok) throw new Error("scan should succeed");
    const res = runParsers(scan, readFileSyncUtf8);
    const cfg = res.files.find((f) => f.kind === "config");
    if (!cfg || cfg.kind !== "config") throw new Error("missing config file");
    expect(cfg.model.defaultSchema).toBe("spec-driven");
    expect(cfg.model.tools).toEqual(["claude"]);
  });

  it("aggregates issues across all files into the top-level issues array", () => {
    // Inject a delta-header error into the main spec.
    const specPath = path.join(root, "openspec", "specs", "auth", "spec.md");
    writeFileSync(specPath, "## ADDED Requirements\n\n### Requirement: Bad\nbody\n");

    const scan = scanProjectTree(root);
    if (!scan.ok) throw new Error("scan should succeed");
    const res = runParsers(scan, readFileSyncUtf8);
    expect(res.issues.length).toBeGreaterThan(0);
    expect(res.issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("never throws on an unreadable file — records an error issue and continues", () => {
    const scan = scanProjectTree(root);
    if (!scan.ok) throw new Error("scan should succeed");
    const failing = (_p: string) => {
      throw new Error("EIO");
    };
    const res = runParsers(scan, failing);
    expect(res.files).toHaveLength(0);
    expect(res.issues.length).toBe(scan.specs.length + 1 + 1 + 1); // spec + delta + tasks + config
    expect(res.issues.every((i) => i.severity === "error")).toBe(true);
  });
});
