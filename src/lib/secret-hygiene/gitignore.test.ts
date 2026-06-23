/**
 * Task 7.1 (§0.6) — `.gitignore` pre-ignores sidecar paths + secret-bearing files.
 *
 * Spec source: `secret-hygiene-gate` —
 * "gitignore pre-ignores sidecar fallback path and secret-bearing files":
 *   `.gitignore` SHALL exclude `.env*`, `*.key`, `*.pem`, `secrets/`,
 *   `auth.json`, `config.local.yaml`, the sidecar location
 *   (`openspec/.dashboard/` AND `<repo>/.openspec-dashboard/`), server DB
 *   files, and anything carrying API keys.
 *
 * The test plants a file at each required path inside the real repo working
 * tree and asserts `git check-ignore` reports it ignored, so a gate-flip or
 * stray tracked secret can never leak via `git status`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function repoRoot(): string {
  return resolve(__dirname, "..", "..", "..");
}

/**
 * Every path the spec mandates `.gitignore` to exclude. The relative path is
 * created under the repo root, checked, then removed. Paths are chosen so they
 * never collide with real tracked content.
 */
const REQUIRED_IGNORED: Array<{ rel: string; why: string }> = [
  { rel: ".env.local", why: ".env*" },
  { rel: "deploy.key", why: "*.key" },
  { rel: "tls/server.pem", why: "*.pem" },
  { rel: "secrets/aws-creds.txt", why: "secrets/" },
  { rel: "auth.json", why: "auth.json" },
  { rel: "config.local.yaml", why: "config.local.yaml" },
  { rel: "app.db", why: "server DB files" },
  // Both sidecar locations (D0-5): canonical + fallback.
  { rel: "openspec/.dashboard/state.json", why: "sidecar canonical" },
  { rel: ".openspec-dashboard/state.json", why: "sidecar fallback" },
];

const CREATED: string[] = [];

function plant(rel: string): string {
  const abs = join(repoRoot(), rel);
  mkdirSync(resolve(abs, ".."), { recursive: true });
  // `git check-ignore` only needs the path to exist for a definitive answer;
  // we write an empty file.
  if (!existsSync(abs)) {
    execSync(`touch "${abs}"`);
  }
  CREATED.push(abs);
  return abs;
}

/** Returns true iff `git check-ignore` reports `abs` as ignored. */
function isIgnored(abs: string): boolean {
  try {
    execSync(`git check-ignore "${abs}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  for (const abs of CREATED.splice(0)) {
    try {
      rmSync(abs, { force: true });
    } catch {
      /* best-effort cleanup */
    }
    // Remove now-empty planted directories (only those we created).
  }
});

describe("gitignore pre-ignores sidecar + secret-bearing files (Task 7.1)", () => {
  for (const { rel, why } of REQUIRED_IGNORED) {
    it(`ignores ${rel} (${why})`, () => {
      const abs = plant(rel);
      expect(isIgnored(abs), `${rel} should be git-ignored (${why})`).toBe(true);
    });
  }

  it("does NOT ignore normal source files (sanity)", () => {
    // A regular tracked-looking path must remain visible to git status.
    const abs = plant("src/lib/secret-hygiene/__gitignore_sanity_check.tmp");
    expect(isIgnored(abs), "normal source path must NOT be ignored").toBe(false);
  });
});
