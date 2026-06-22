import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Task 7.3 — Docs + demo + contribution guide (plan §4.3).
//
// Structural gates that the Phase 4 docs deliverables exist and cover the
// required topics. Mirrors the threat-model-v1 precedent: machine-checkable
// gates so the milestone verifier doesn't have to eyeball prose.

const REPO_ROOT = resolve(__dirname, "..", "..");

function read(rel: string): string {
  const p = resolve(REPO_ROOT, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

describe("CONTRIBUTING.md (task 7.3 contribution guide)", () => {
  const path = "CONTRIBUTING.md";

  it("exists", () => {
    expect(existsSync(resolve(REPO_ROOT, path))).toBe(true);
  });

  it("documents the local dev setup", () => {
    const body = read(path);
    expect(body).toMatch(/npm (ci|install|run dev)/i);
  });

  it("documents running tests", () => {
    const body = read(path);
    expect(body).toMatch(/npm run test|vitest/i);
  });

  it("documents the OpenSpec change workflow", () => {
    const body = read(path);
    expect(body).toMatch(/openspec/i);
    expect(body).toMatch(/change/i);
  });

  it("references the code of conduct or community expectations", () => {
    const body = read(path);
    expect(body).toMatch(/code of conduct|be kind|respectful|constructive/i);
  });
});

describe("docs/demo.md (task 7.3 demo walkthrough)", () => {
  const path = "docs/demo.md";

  it("exists", () => {
    expect(existsSync(resolve(REPO_ROOT, path))).toBe(true);
  });

  it("walks through registering a project", () => {
    const body = read(path);
    expect(body).toMatch(/project/i);
    expect(body).toMatch(/register/i);
  });

  it("walks through the kanban board", () => {
    const body = read(path);
    expect(body).toMatch(/kanban/i);
  });

  it("walks through specs or changes", () => {
    const body = read(path);
    expect(body).toMatch(/spec|change/i);
  });
});
