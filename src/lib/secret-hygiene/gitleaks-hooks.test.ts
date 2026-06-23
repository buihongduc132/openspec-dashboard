/**
 * Task 7.2 (§0.6) — gitleaks hooks catch a staged secret + auto-wire on install.
 *
 * Spec source: `secret-hygiene-gate` —
 * "Pre-commit, pre-push, and CI gitleaks gates wired":
 *   Scenario "Hooks are installed and runnable": WHEN a developer clones the
 *   repo and runs the hook-install task THEN pre-commit and pre-push hooks are
 *   present and executable, and a deliberate test-secret is caught by each.
 *
 * This is the BEHAVIOURAL complement to `gitleaks-config.test.ts` (which only
 * checks the hook files exist). Here we spin up a throwaway git repo, copy in
 * the committed `.gitleaks.toml` + hooks, plant + stage a fake GCP API key,
 * and assert each hook exits non-zero (i.e. it would abort the commit/push).
 *
 * It also pins that hooks auto-wire on `npm install` via a `prepare` script
 * (the husky/lefthook-equivalent for the committed `.githooks/` dir) so a fresh
 * clone gets the hooks without a manual step.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync, mkdirSync, cpSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function repoRoot(): string {
  return resolve(__dirname, "..", "..", "..");
}

const GITLEAKS_AVAILABLE = (() => {
  try {
    execSync("gitleaks version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** GCP API key that gitleaks' built-in `gcp-api-key` rule fires on. */
const FAKE_SECRET = 'api_key = "AIzaSyDQDM5OAhJ6_5pX8V9aYqLbTqW7rZ1mMn0"\n';

describe("gitleaks hooks catch a staged secret (Task 7.2)", () => {
  describe.skipIf(!GITLEAKS_AVAILABLE)("behavioural: each hook rejects a staged secret", () => {
    function withTempRepo(fn: (dir: string) => void) {
      const dir = join(tmpdir(), "hook-test-" + process.pid);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      try {
        execSync("git init -q", { cwd: dir });
        execSync('git config user.email t@t.t', { cwd: dir });
        execSync('git config user.name t', { cwd: dir });
        // Bring in the committed config + hooks.
        mkdirSync(join(dir, ".githooks"), { recursive: true });
        cpSync(join(repoRoot(), ".gitleaks.toml"), join(dir, ".gitleaks.toml"));
        cpSync(join(repoRoot(), ".githooks", "pre-commit"), join(dir, ".githooks", "pre-commit"));
        cpSync(join(repoRoot(), ".githooks", "pre-push"), join(dir, ".githooks", "pre-push"));
        execSync('git config core.hooksPath .githooks', { cwd: dir });
        fn(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it("pre-commit hook aborts (non-zero) when a secret is staged", () => {
      withTempRepo((dir) => {
        writeFileSync(join(dir, "leak.txt"), FAKE_SECRET);
        execSync("git add leak.txt", { cwd: dir });
        let exit = 0;
        try {
          execSync("bash .githooks/pre-commit", { cwd: dir, stdio: "ignore" });
        } catch (e) {
          exit = (e as { status?: number }).status ?? 1;
        }
        expect(exit, "pre-commit must exit non-zero on a staged secret").not.toBe(0);
      });
    });

    it("pre-push hook aborts (non-zero) when history contains a secret", () => {
      withTempRepo((dir) => {
        writeFileSync(join(dir, "leak.txt"), FAKE_SECRET);
        // Commit the secret bypassing the hook so we can exercise pre-push.
        execSync('git add leak.txt', { cwd: dir });
        execSync('git commit -q --no-verify -m "leak"', { cwd: dir });
        let exit = 0;
        try {
          execSync("bash .githooks/pre-push < /dev/null", { cwd: dir, stdio: "ignore" });
        } catch (e) {
          exit = (e as { status?: number }).status ?? 1;
        }
        expect(exit, "pre-push must exit non-zero on a secret in history").not.toBe(0);
      });
    });
  });
});

describe("hooks auto-wire on npm install (Task 7.2)", () => {
  it("package.json declares a `prepare` script that installs the hooks", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const prepare = pkg.scripts?.prepare;
    expect(prepare, "package.json must declare a `prepare` script").toBeTruthy();
    // The prepare script must reference the hook installer so a fresh clone
    // gets the hooks wired automatically (husky/lefthook-equivalent).
    expect(prepare!).toMatch(/install-hooks/);
  });

  it("the referenced install-hooks.sh exists and sets core.hooksPath", () => {
    const installer = join(repoRoot(), "scripts", "install-hooks.sh");
    expect(existsSync(installer), "scripts/install-hooks.sh must exist").toBe(true);
    const text = readFileSync(installer, "utf8");
    expect(text).toMatch(/core\.hooksPath/);
  });
});
