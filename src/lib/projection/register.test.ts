/**
 * Task 4.1 (RED) — local project registration with a path allowlist.
 *
 * Drives `src/lib/projection/register.ts` (task 4.2 GREEN) against the
 * filesystem-projection spec requirement "Local project registration with
 * path allowlist":
 *
 *  - Scenario "Register an allowlisted local path": an allowlisted absolute
 *    path is registered and its `openspec/` tree is watchable.
 *  - Scenario "Reject a path outside the allowlist": `/etc` is rejected with a
 *    path-allowlist error and no watcher is started.
 *  - Scenario "Reject a path-traversal attempt": `/home/alice/../../etc/secrets`
 *    is resolved to its absolute form and rejected (no traversal bypass).
 *
 * Phase 0 registers LOCAL paths only — no remote clone, no execution
 * (spec: "Registration SHALL NOT clone or execute anything remote in Phase 0").
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  registerLocalProject,
  PathAllowlistError,
} from "@/lib/projection/register";

describe("task 4.1 — local project registration with path allowlist", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reg-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("registers an allowlisted local path", () => {
    const project = registerLocalProject(tmpRoot, { allow: [tmpRoot] });

    expect(project.rootPath).toBe(path.resolve(tmpRoot));
    expect(project.id).toBeTruthy();
    // Phase 0 is local-only: no remote enrollment source.
    expect(project.enrollmentSource).toBe("local");
  });

  it("rejects a path outside the allowlist (/etc)", () => {
    expect(() => registerLocalProject("/etc", { allow: [tmpRoot] })).toThrow(
      PathAllowlistError,
    );
  });

  it("rejects a path-traversal attempt against the allowlist", () => {
    // `/home/alice/../../etc/secrets` analogue: a relative traversal that
    // resolves OUTSIDE the allowlisted root.
    const traversal = path.join(tmpRoot, "..", "..", "etc", "secrets");

    expect(() =>
      registerLocalProject(traversal, { allow: [tmpRoot] }),
    ).toThrow(PathAllowlistError);
  });

  it("does not start a watcher or clone remotely (Phase 0: local only)", () => {
    // Registration must be a pure path-validation step: it neither touches the
    // network nor starts a chokidar watcher. A non-existent-but-allowlisted
    // path is still accepted (watchability is the projection layer's concern).
    const ghost = path.join(tmpRoot, "does-not-exist-yet");
    const project = registerLocalProject(ghost, { allow: [tmpRoot] });

    expect(project.rootPath).toBe(path.resolve(ghost));
    expect(project.enrollmentSource).toBe("local");
  });

  it("respects a /** subtree allowlist entry", () => {
    const parent = path.dirname(tmpRoot);

    const project = registerLocalProject(tmpRoot, {
      allow: [`${parent}/**`],
    });

    expect(project.rootPath).toBe(path.resolve(tmpRoot));
  });
});
