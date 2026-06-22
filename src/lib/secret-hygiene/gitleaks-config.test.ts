/**
 * Task 1.12 — gitleaks secret-hygiene guardrails.
 *
 * Phase 0.6 (publication gate) requires three gitleaks touchpoints BEFORE any
 * auth/key work lands:
 *   1. a repo-root gitleaks config (`.gitleaks.toml`),
 *   2. local `pre-commit` + `pre-push` git hooks that invoke gitleaks, and
 *   3. a CI secret-scan job that blocks merges on a leak.
 *
 * These tests assert those artifacts exist, are wired correctly, and that the
 * bundled config + the installed `gitleaks` binary actually detect a planted
 * secret. They run against the real repo root (resolved from `process.cwd()`),
 * so they must be executed with the repo as the working directory — which is
 * how vitest is invoked in CI (`npm run test`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync, mkdtempSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Resolve a path against the repo root (vitest cwd === repo root in CI). */
function repoRoot(): string {
  // __dirname is .../src/lib/secret-hygiene — walk up three levels.
  return resolve(__dirname, "..", "..", "..");
}

function repoPath(rel: string): string {
  return join(repoRoot(), rel);
}

describe("gitleaks config (Task 1.12)", () => {
  it("ships a repo-root .gitleaks.toml config file", () => {
    const cfg = repoPath(".gitleaks.toml");
    expect(existsSync(cfg), `${cfg} should exist`).toBe(true);
    const text = readFileSync(cfg, "utf8");
    // Must extend the gitleaks default ruleset so we inherit upstream rules.
    // Accepted forms: `[extend]` with `useDefault = true` (modern) OR a
    // `path = "gitleaks.toml"` literal (legacy alias for the bundled defaults).
    const extendsDefault = /\[extend\][\s\S]*?(useDefault\s*=\s*true|path\s*=\s*"gitleaks\.toml")/.test(text);
    expect(extendsDefault, "config must extend gitleaks' bundled default rules").toBe(true);
  });

  it("gitleaks + config actually detect a planted secret", () => {
    // Skip gracefully if gitleaks isn't on PATH (e.g. some CI images).
    let gitleaksOk = true;
    try {
      execSync("gitleaks version", { stdio: "ignore" });
    } catch {
      gitleaksOk = false;
    }
    if (!gitleaksOk) {
      console.warn("[gitleaks-config.test] gitleaks not on PATH — skipping live-detect assertion");
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), "gleak-"));
    // Google API key — gitleaks' built-in `gcp-api-key` rule fires on this.
    // (The well-known `AKIAIOSFODNN7EXAMPLE` AWS key is explicitly excluded by
    // gitleaks as AWS's documented example, so it can't be used here.)
    writeFileSync(join(dir, "leak.txt"), 'api_key = "AIzaSyDQDM5OAhJ6_5pX8V9aYqLbTqW7rZ1mMn0"\n');
    const cfg = repoPath(".gitleaks.toml");

    let exitCode = 0;
    try {
      execSync(
        `gitleaks detect --no-git --source="${dir}" --config="${cfg}" --no-banner --redact`,
        { stdio: "ignore" },
      );
    } catch (err) {
      exitCode = (err as { status?: number }).status ?? 1;
    }
    // gitleaks exits non-zero when a leak is found — that's the success case.
    expect(exitCode, "gitleaks should exit non-zero when a secret is found").not.toBe(0);
  });

  it("allows the committed .env.example (false-positive suppression)", () => {
    const cfg = readFileSync(repoPath(".gitleaks.toml"), "utf8");
    expect(cfg).toContain(".env.example");
  });
});

describe("git hooks (Task 1.12)", () => {
  function assertHook(name: string) {
    const hook = repoPath(`.githooks/${name}`);
    expect(existsSync(hook), `${hook} should exist`).toBe(true);
    const st = statSync(hook);
    // Executable bit must be set for git to run the hook.
    expect(st.mode & 0o111, `${name} must be executable`).not.toBe(0);
    const text = readFileSync(hook, "utf8");
    expect(text, `${name} must invoke gitleaks`).toMatch(/gitleaks/);
    expect(text, `${name} must have a shebang`).toMatch(/^#!\/usr\/bin\/env\s+bash/);
  }

  it("ships an executable pre-commit hook that runs gitleaks", () => {
    assertHook("pre-commit");
  });

  it("ships an executable pre-push hook that runs gitleaks", () => {
    assertHook("pre-push");
  });
});

describe("CI gitleaks gate (Task 1.12)", () => {
  it(".github/workflows/ci.yml has a secret-scan job running gitleaks", () => {
    const ci = readFileSync(repoPath(".github/workflows/ci.yml"), "utf8");
    // A dedicated job whose name mentions secret scanning.
    expect(ci).toMatch(/secret[-_ ]?scan|gitleaks/i);
    // The job must run the gitleaks action/binary and run on both push + PR.
    expect(ci).toMatch(/gitleaks/);
    expect(ci).toMatch(/pull_request/);
    expect(ci).toMatch(/\bpush\b/);
  });
});
