/**
 * Task 4.11 (RED) — SIDECAR_LOCATION flows through every sidecar path
 * reference (design D0-5), and flipping the single constant relocates ALL
 * sidecar paths atomically — including `etags.json`.
 *
 * D0-5:
 *   "`SIDECAR_LOCATION` is a single constant ... Every spec requirement that
 *    references the sidecar path reads through this constant. ... If Gate 1
 *    ever fails, change ONLY this constant to `.openspec-dashboard/` and every
 *    sidecar path relocates atomically."
 *
 * This test proves that contract two ways:
 *
 *  1. **Atomic relocation:** flipping the single constant relocates EVERY
 *     Phase-0 sidecar filesystem consumer in one move — `etags.json`
 *     (etag-store) AND the task sidecar (`tasks/<change>.json`). No second
 *     edit is required (that is what "atomic" means here: one source of
 *     truth).
 *  2. **No bypass:** no Phase-0 production module constructs a sidecar path
 *     from a hardcoded `openspec/.dashboard` literal; every consumer imports
 *     the constant / resolver from `sidecar.ts`.
 *
 * The flip is exercised through the documented test seam
 * {@link __setSidecarLocationForTest}, which simulates the operator changing
 * ONLY the constant (the single edit D0-5 promises is sufficient).
 */
import { describe, it, expect } from "vitest";
import {
  SIDECAR_LOCATION,
  sidecarPath,
  resolveSidecar,
  __setSidecarLocationForTest,
} from "@/lib/projection/sidecar";
import { PersistentEtagStore } from "@/lib/projection/etag-store";
import { sidecarPath as taskSidecarPath } from "@/lib/tasks-sidecar/sidecar";

describe("task 4.11 — SIDECAR_LOCATION single-constant relocation (D0-5)", () => {
  it("defaults to the empirically-confirmed in-tree location (Gate 1 PASS)", () => {
    expect(SIDECAR_LOCATION).toBe("openspec/.dashboard/");
  });

  it("sidecarPath / resolveSidecar read the active location", () => {
    const reset = __setSidecarLocationForTest(".openspec-dashboard/");
    try {
      expect(sidecarPath("etags.json")).toBe(".openspec-dashboard/etags.json");
      expect(resolveSidecar("/repo", "audit/chain.log")).toBe(
        "/repo/.openspec-dashboard/audit/chain.log",
      );
    } finally {
      reset();
    }
    // After reset, the default location is restored.
    expect(sidecarPath("etags.json")).toBe("openspec/.dashboard/etags.json");
  });

  it("flipping the single constant relocates etags.json (etag-store) atomically", async () => {
    const reset = __setSidecarLocationForTest(".openspec-dashboard/");
    try {
      // A recording fake fs captures every path the store writes/renames so
      // we can assert WHERE etags.json lands without touching real disk.
      const writePaths: string[] = [];
      const fakeFs: import("@/lib/projection/etag-store").EtagStoreFs = {
        async mkdir() {},
        async writeFile(p) {
          writePaths.push(p);
        },
        async rename(_from, to) {
          writePaths.push(to);
        },
        async unlink() {},
        async readFile() {
          return null;
        },
        async readdir() {
          return [];
        },
      };

      const store = new PersistentEtagStore({
        projectRoot: "/repo",
        deriveFiles: [],
        fs: fakeFs,
      });
      await store.init();
      // Committing forces an atomic persist; the write must land under the
      // FLIPPED location, not the default.
      await store.commit("openspec/changes/x/tasks.md", "line:1", "- [ ] t", undefined);
      const underFlipped = writePaths.some((p) =>
        p.startsWith("/repo/.openspec-dashboard/"),
      );
      const underDefault = writePaths.some((p) =>
        p.includes("/repo/openspec/.dashboard/"),
      );
      expect(underFlipped).toBe(true);
      expect(underDefault).toBe(false);
    } finally {
      reset();
    }
  });

  it("flipping the single constant relocates the task sidecar path atomically", () => {
    // At the default location:
    expect(taskSidecarPath("/repo", "add-rbac")).toBe(
      "/repo/openspec/.dashboard/tasks/add-rbac.json",
    );
    const reset = __setSidecarLocationForTest(".openspec-dashboard/");
    try {
      // After the flip, the SAME call relocates — proving tasks-sidecar reads
      // through the constant rather than hardcoding the prefix.
      expect(taskSidecarPath("/repo", "add-rbac")).toBe(
        "/repo/.openspec-dashboard/tasks/add-rbac.json",
      );
    } finally {
      reset();
    }
  });

  it("no Phase-0 production module hardcodes the sidecar prefix bypassing the constant", async () => {
    // Read every non-test production file under the Phase-0 projection +
    // sidecar + etag surface and assert none constructs a sidecar path from a
    // raw `openspec/.dashboard` literal. The constant in sidecar.ts is the
    // sole definition; everything else composes the exported resolvers.
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const targets = [
      "src/lib/projection/etag-store.ts",
      "src/lib/projection/sidecar.ts",
      "src/lib/tasks-sidecar/sidecar.ts",
    ];

    for (const rel of targets) {
      const content = await readFile(join(process.cwd(), rel), "utf8");
      if (rel === "src/lib/projection/sidecar.ts") {
        // The constant definition lives here and ONLY here.
        expect(content).toContain('SIDECAR_LOCATION = "openspec/.dashboard/"');
        continue;
      }
      // Consumers must NOT assign a raw sidecar-prefix string literal (the
      // bypass D0-5 warns against). Comments may mention the path for
      // documentation; we strip those before checking.
      const stripped = stripComments(content);
      expect(stripped).not.toContain('"openspec/.dashboard');
      expect(stripped).not.toContain("`openspec/.dashboard");
    }
  });
});

/** Strip `//` line comments and `/* *\/` block comments + JSDoc for the audit. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}
