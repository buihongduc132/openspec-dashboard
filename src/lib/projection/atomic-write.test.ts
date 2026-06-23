/**
 * Task 4.5 (RED) — projection-aware atomic write.
 *
 * Drives `src/lib/projection/atomic-write.ts` (task 4.6 GREEN) against the
 * filesystem-projection spec requirement "Atomic server-side writes
 * (server → disk)":
 *
 *   "Every server-side mutation SHALL write the corresponding canonical
 *    file(s) atomically (write-temp + rename). A write failure SHALL roll
 *    back the in-memory projection and return a 5xx describing the partial
 *    state."
 *
 * Scenarios asserted:
 *  - "Successful atomic write": content is written to a sibling temp file in
 *    the SAME directory and then renamed onto the target; a reader never
 *    observes a half-written file (the target is touched ONLY by the rename,
 *    never by a partial writeFile).
 *  - "Write failure rolls back projection": when the rename fails, the
 *    in-memory projection is rolled back to its pre-write state (the provided
 *    `rollback` hook is invoked exactly once) and the caller receives a 5xx
 *    `ProjectionWriteError` describing the unflushed partial state.
 *
 * The lower-level temp+rename primitive already lives in
 * `src/lib/filesystem-projection/atomic-write.ts` (Task 1.8); this module adds
 * the PROJECTION-level concerns: rollback-on-failure + 5xx error shape so the
 * mutating-endpoint layer (ETag middleware, audit emission) can surface a
 * faithful 5xx to the client.
 */
import { describe, it, expect, vi } from "vitest";
import {
  commitAtomicWrite,
  ProjectionWriteError,
  type AtomicProjectionWriteOptions,
} from "@/lib/projection/atomic-write";
import type { AtomicFs } from "@/lib/filesystem-projection";

/** In-memory fake filesystem that records every call (reuses the AtomicFs surface). */
function makeFakeFs(opts: {
  writeError?: Error;
  renameError?: Error;
} = {}): AtomicFs & {
  calls: string[];
  files: Map<string, string>;
  readFile: (p: string) => Promise<string | null>;
} {
  const calls: string[] = [];
  const files = new Map<string, string>();
  const fs: AtomicFs & { calls: string[]; files: Map<string, string> } & {
    readFile: (p: string) => Promise<string | null>;
  } = {
    calls,
    files,
    async mkdir() {
      calls.push("mkdir");
    },
    async writeFile(p, data) {
      calls.push(`writeFile:${p}`);
      if (opts.writeError) throw opts.writeError;
      files.set(p, data);
    },
    async rename(from, to) {
      calls.push(`rename:${from}->${to}`);
      if (opts.renameError) throw opts.renameError;
      const v = files.get(from);
      if (v !== undefined) {
        files.delete(from);
        files.set(to, v);
      }
    },
    async unlink(p) {
      calls.push(`unlink:${p}`);
      files.delete(p);
    },
    async readFile(p) {
      return files.has(p) ? (files.get(p) ?? null) : null;
    },
  };
  return fs;
}

describe("task 4.5 — projection-aware atomic write", () => {
  const TARGET = "/proj/openspec/changes/phase0/tasks.md";

  it("writes content via a sibling temp file then renames (reader never sees a half-write)", async () => {
    const fs = makeFakeFs();
    const rollback = vi.fn();

    await commitAtomicWrite({
      filePath: TARGET,
      content: "- [x] ship it",
      rollback,
      fs,
    });

    // The target path is touched ONLY by the rename — never by a bare
    // writeFile to the final path. That is what "reader never sees a
    // half-write" means at the call-sequence level.
    const bareWritesToTarget = fs.calls.filter(
      (c) => c === `writeFile:${TARGET}`,
    );
    expect(bareWritesToTarget).toHaveLength(0);

    // The temp write landed in the SAME directory as the target (same
    // filesystem → atomic rename on POSIX).
    const writeCalls = fs.calls.filter((c) => c.startsWith("writeFile:"));
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]).toContain("/proj/openspec/changes/phase0/");
    expect(writeCalls[0]).not.toMatch(/tasks\.md$/);

    // The rename moves the temp path onto the final target.
    const renameCalls = fs.calls.filter((c) => c.startsWith("rename:"));
    expect(renameCalls).toHaveLength(1);
    expect(renameCalls[0]).toMatch(/->.*\/proj\/openspec\/changes\/phase0\/tasks\.md$/);

    // Final durable content is exactly what was committed.
    expect(fs.files.get(TARGET)).toBe("- [x] ship it");

    // On success the projection is left in sync — rollback is NOT invoked.
    expect(rollback).not.toHaveBeenCalled();
  });

  it("rolls back the in-memory projection and returns a 5xx when the rename fails", async () => {
    const fs = makeFakeFs({ renameError: new Error("rename EBUSY") });
    // Pre-existing on-disk content the projection must be restored to.
    fs.files.set(TARGET, "ORIGINAL");

    const rollback = vi.fn();
    const commit = vi.fn();

    let caught: unknown;
    try {
      await commitAtomicWrite({
        filePath: TARGET,
        content: "NEW",
        commit,
        rollback,
        fs,
      } satisfies AtomicProjectionWriteOptions);
    } catch (err) {
      caught = err;
    }

    // The caller receives a ProjectionWriteError whose HTTP status is a 5xx
    // and whose `partialState` describes the unflushed file.
    expect(caught).toBeInstanceOf(ProjectionWriteError);
    const err = caught as ProjectionWriteError;
    expect(err.statusCode).toBeGreaterThanOrEqual(500);
    expect(err.statusCode).toBeLessThan(600);
    expect(err.partialState.filePath).toBe(TARGET);
    // lastGoodContent reflects what is actually on disk (the rename never
    // happened), so the operator/UI knows the projection was rewound to it.
    expect(err.partialState.lastGoodContent).toBe("ORIGINAL");

    // The in-memory projection was rolled back exactly once.
    expect(rollback).toHaveBeenCalledTimes(1);
    // The commit hook (advance projection) was never reached.
    expect(commit).not.toHaveBeenCalled();
    // The temp file was cleaned up.
    const leftovers = [...fs.files.keys()].filter((p) => p !== TARGET);
    expect(leftovers).toEqual([]);
  });

  it("rolls back and returns a 5xx when the temp write itself fails", async () => {
    const fs = makeFakeFs({ writeError: new Error("ENOSPC") });
    fs.files.set(TARGET, "ORIGINAL");

    const rollback = vi.fn();

    let caught: unknown;
    try {
      await commitAtomicWrite({
        filePath: TARGET,
        content: "NEW",
        rollback,
        fs,
      } satisfies AtomicProjectionWriteOptions);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProjectionWriteError);
    const err = caught as ProjectionWriteError;
    expect(err.statusCode).toBeGreaterThanOrEqual(500);
    expect(err.partialState.filePath).toBe(TARGET);
    expect(rollback).toHaveBeenCalledTimes(1);
    // rename was never attempted.
    expect(fs.calls.some((c) => c.startsWith("rename:"))).toBe(false);
  });
});
