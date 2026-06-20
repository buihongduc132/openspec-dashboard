/**
 * Tests for the reference-context factory (task 5.1).
 *
 * Task 5.1: Read `REFERENCE_REPO_ROOT` env in the builder context (default to
 * project `rootPath`). The canonical source of the repo-root base MUST live in
 * the entity-reference lib (design decision D2) so every surface that builds a
 * reference context — the API route and any page — agrees on precedence:
 * `REFERENCE_REPO_ROOT` env wins; otherwise the project's `rootPath` is used.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildReferenceContext,
  resolveRepoRoot,
} from "@/lib/entity-reference/context";

const ORIGINAL = process.env.REFERENCE_REPO_ROOT;

beforeEach(() => {
  delete process.env.REFERENCE_REPO_ROOT;
});

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.REFERENCE_REPO_ROOT;
  } else {
    process.env.REFERENCE_REPO_ROOT = ORIGINAL;
  }
});

describe("resolveRepoRoot (task 5.1)", () => {
  it("returns the REFERENCE_REPO_ROOT env value when set", () => {
    process.env.REFERENCE_REPO_ROOT = "/from/env";
    expect(resolveRepoRoot("/project/root")).toBe("/from/env");
  });

  it("defaults to the project rootPath when the env is unset", () => {
    expect(resolveRepoRoot("/project/root")).toBe("/project/root");
  });

  it("returns an empty string when neither env nor rootPath is provided", () => {
    expect(resolveRepoRoot()).toBe("");
  });

  it("ignores a blank/whitespace env value and falls back to rootPath", () => {
    process.env.REFERENCE_REPO_ROOT = "   ";
    expect(resolveRepoRoot("/project/root")).toBe("/project/root");
  });
});

describe("buildReferenceContext (task 5.1)", () => {
  it("seeds repoRoot from REFERENCE_REPO_ROOT env", () => {
    process.env.REFERENCE_REPO_ROOT = "/from/env";
    const ctx = buildReferenceContext({ projectRootPath: "/project/root" });
    expect(ctx.repoRoot).toBe("/from/env");
    expect(ctx.projectRootPath).toBe("/project/root");
  });

  it("defaults repoRoot to the project rootPath when env is unset", () => {
    const ctx = buildReferenceContext({ projectRootPath: "/project/root" });
    expect(ctx.repoRoot).toBe("/project/root");
  });

  it("carries relational lookups through the context", () => {
    const ctx = buildReferenceContext({
      projectRootPath: "/project/root",
      projectName: "demo",
      changeName: "add-thing",
      domainName: "core",
    });
    expect(ctx).toMatchObject({
      repoRoot: "/project/root",
      projectRootPath: "/project/root",
      projectName: "demo",
      changeName: "add-thing",
      domainName: "core",
    });
  });
});
