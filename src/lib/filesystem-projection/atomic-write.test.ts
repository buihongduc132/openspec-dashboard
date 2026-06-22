/**
 * Task 1.8 — Atomic write (write-to-temp + rename) unit tests.
 *
 * Spec source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "Filesystem projection with
 * atomic writes"; req 01 §1.4, INV-7).
 *
 * Behaviour asserted here:
 *  - The writer writes content to a temp file in the same directory then
 *    renames it onto the target (atomic on POSIX).
 *  - On a failure during temp-write OR rename, the target is NOT left in a
 *    partial state and the temp file is cleaned up.
 *  - On success no temp file is left behind.
 */
import { describe, it, expect } from "vitest";
import { writeFileAtomic, type AtomicFs } from "@/lib/filesystem-projection";

/** Build an in-memory fake filesystem that records every call. */
function makeFakeFs(opts: {
  writeError?: Error;
  renameError?: Error;
} = {}): AtomicFs & { calls: string[]; files: Map<string, string> } {
  const calls: string[] = [];
  const files = new Map<string, string>();
  const fs: AtomicFs & { calls: string[]; files: Map<string, string> } = {
    calls,
    files,
    async mkdir(dir) {
      calls.push(`mkdir:${dir}`);
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
  };
  return fs;
}

describe("writeFileAtomic", () => {
  it("writes content via a temp file in the target directory then renames", async () => {
    const fs = makeFakeFs();
    await writeFileAtomic("/proj/openspec/tasks.md", "- [ ] ship", fs);

    // mkdir called for parent dir.
    expect(fs.calls.some((c) => c.startsWith("mkdir:/proj/openspec"))).toBe(true);
    // writeFile called with a sibling temp path (same dir, hidden/temp suffix).
    const writeCalls = fs.calls.filter((c) => c.startsWith("writeFile:"));
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]).toContain("/proj/openspec/");
    expect(writeCalls[0]).not.toMatch(/tasks\.md$/);
    // rename called from the temp path onto the final target.
    const renameCalls = fs.calls.filter((c) => c.startsWith("rename:"));
    expect(renameCalls).toHaveLength(1);
    expect(renameCalls[0]).toMatch(/->.*\/proj\/openspec\/tasks\.md$/);
    // Final content is at the target.
    expect(fs.files.get("/proj/openspec/tasks.md")).toBe("- [ ] ship");
  });

  it("does not leave a temp file behind on success", async () => {
    const fs = makeFakeFs();
    await writeFileAtomic("/proj/openspec/tasks.md", "x", fs);
    const leftovers = [...fs.files.keys()].filter((p) => p !== "/proj/openspec/tasks.md");
    expect(leftovers).toEqual([]);
  });

  it("cleans up the temp file and leaves the target untouched when rename fails", async () => {
    const fs = makeFakeFs({ renameError: new Error("rename EBUSY") });
    // Pre-existing target must be preserved.
    fs.files.set("/proj/openspec/tasks.md", "ORIGINAL");

    await expect(
      writeFileAtomic("/proj/openspec/tasks.md", "NEW", fs),
    ).rejects.toThrow("rename EBUSY");

    // Target content untouched.
    expect(fs.files.get("/proj/openspec/tasks.md")).toBe("ORIGINAL");
    // Temp file unlinked.
    expect(fs.calls.some((c) => c.startsWith("unlink:"))).toBe(true);
    // No leftover temp file in the file map.
    const leftovers = [...fs.files.keys()].filter((p) => p !== "/proj/openspec/tasks.md");
    expect(leftovers).toEqual([]);
  });

  it("cleans up the temp file and never renames when the temp write fails", async () => {
    const fs = makeFakeFs({ writeError: new Error("ENOSPC") });
    fs.files.set("/proj/openspec/tasks.md", "ORIGINAL");

    await expect(
      writeFileAtomic("/proj/openspec/tasks.md", "NEW", fs),
    ).rejects.toThrow("ENOSPC");

    expect(fs.files.get("/proj/openspec/tasks.md")).toBe("ORIGINAL");
    // rename was never attempted.
    expect(fs.calls.some((c) => c.startsWith("rename:"))).toBe(false);
  });
});
