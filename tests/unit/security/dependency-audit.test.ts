import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import * as path from "node:path";

/**
 * Task 1.15 — Fix Dependabot moderate vuln + `npm audit` 6 moderates.
 *
 * Behaviour: after the dependency fix, NO installed copy of `esbuild` or
 * `postcss` in the dependency tree may fall inside a known-moderate advisory
 * range. This guards against regressions where a transitive copy is re-added
 * at a vulnerable version.
 *
 * Advisories covered:
 *   - esbuild GHSA-67mh-4wv8-2f99 / GHSA-g7r4-m6w7-qqqr
 *       vulnerable: <=0.24.2 || 0.27.3 - 0.28.0
 *   - postcss GHSA-qx2v-qp2m-jg93 (XSS via unescaped </style>)
 *       vulnerable: <8.5.10
 */

const REPO_ROOT = process.cwd();

interface PkgInfo {
  location: string;
  version: string;
}

/** Find every installed copy of a package by name under node_modules. */
function findInstalledPackages(name: string): PkgInfo[] {
  // Filesystem scan: the authoritative source for nested copies (e.g. next
  // bundles its own postcss under node_modules/next/node_modules/postcss,
  // vite bundles its own esbuild).
  const found: PkgInfo[] = [];
  const relPaths = execSync(
    `find node_modules -type f -path "*/${name}/package.json" -not -path "*/.package-lock/*"`,
    { cwd: REPO_ROOT, encoding: "utf-8" },
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const rel of relPaths) {
    // Only count directories whose final component exactly matches the target
    // package name, so @tailwindcss/postcss is ignored when scanning postcss.
    const segments = rel.split("/");
    const dir = segments[segments.length - 2];
    if (dir !== name) continue;
    const full = path.join(REPO_ROOT, rel);
    try {
      const pkg = JSON.parse(readFileSync(full, "utf-8")) as { name?: string; version?: string };
      if (pkg.name !== name) continue;
      found.push({ location: rel, version: pkg.version ?? "0.0.0" });
    } catch {
      /* skip unreadable */
    }
  }
  return found;
}

function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

/** esbuild vulnerable range: <=0.24.2 || 0.27.3 - 0.28.0. */
function isEsbuildVulnerable(version: string): boolean {
  if (compareSemver(version, "0.24.2") <= 0) return true;
  if (
    compareSemver(version, "0.27.3") >= 0 &&
    compareSemver(version, "0.28.0") <= 0
  ) {
    return true;
  }
  return false;
}

/** postcss vulnerable range: <8.5.10. */
function isPostcssVulnerable(version: string): boolean {
  return compareSemver(version, "8.5.10") < 0;
}

describe("dependency audit — task 1.15 moderate vulnerabilities", () => {
  it("installs no vulnerable copy of esbuild anywhere in the tree", () => {
    const copies = findInstalledPackages("esbuild");
    expect(copies.length, "esbuild must be installed").toBeGreaterThan(0);
    const vulnerable = copies.filter((c) => isEsbuildVulnerable(c.version));
    expect(
      vulnerable,
      `vulnerable esbuild copies remain: ${vulnerable.map((c) => `${c.version}@${c.location}`).join(", ")}`,
    ).toEqual([]);
  });

  it("installs no vulnerable copy of postcss anywhere in the tree", () => {
    const copies = findInstalledPackages("postcss");
    expect(copies.length, "postcss must be installed").toBeGreaterThan(0);
    const vulnerable = copies.filter((c) => isPostcssVulnerable(c.version));
    expect(
      vulnerable,
      `vulnerable postcss copies remain: ${vulnerable.map((c) => `${c.version}@${c.location}`).join(", ")}`,
    ).toEqual([]);
  });

  it("package.json declares npm overrides pinning esbuild and postcss to safe versions", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8"),
    ) as { overrides?: Record<string, string> };
    const overrides = pkg.overrides ?? {};
    expect(overrides.esbuild, "overrides.esbuild missing").toBeDefined();
    expect(
      isEsbuildVulnerable(stripRange(overrides.esbuild)),
      `overrides.esbuild (${overrides.esbuild}) is itself vulnerable`,
    ).toBe(false);
    expect(overrides.postcss, "overrides.postcss missing").toBeDefined();
    expect(
      isPostcssVulnerable(stripRange(overrides.postcss)),
      `overrides.postcss (${overrides.postcss}) is itself vulnerable`,
    ).toBe(false);
  });
});

function stripRange(spec: string): string {
  // strip leading ^, ~, >=, >, etc.
  const m = /(\d+\.\d+\.\d+)/.exec(spec);
  return m ? m[1] : spec;
}
