/**
 * Task 4.9 (RED) — persisted per-project ETag store (design D0-9).
 *
 * Drives `src/lib/projection/etag-store.ts` (task 4.10 GREEN) against the
 * filesystem-projection spec requirement "Per-section ETag concurrency
 * (INV-7)" combined with decision D0-9:
 *
 *   "The per-section `monotonicVersion` ... is persisted to a single
 *    `etags.json` per project in the sidecar, reloaded on startup before any
 *    mutating endpoint is served. Bumps are atomic (temp + rename)."
 *
 * Three persistence scenarios asserted here (the ones task 4.9 enumerates):
 *
 *  1. **Restart preserves a client-issued ETag (no spurious 409):** after a
 *     process restart, a client holding an ETag from before the restart can
 *     still commit with that ETag — the persisted version survives.
 *  2. **Missing `etags.json` on startup re-derives from disk + resets version
 *     to genesis (0):** when no sidecar `etags.json` exists, the store reads
 *     the canonical files from disk, splits them into sections, and seeds each
 *     at version 0 (genesis) so a fresh client can begin optimistic concurrency.
 *  3. **Version-file write is atomic (temp+rename):** a version bump writes
 *     `etags.json` via a sibling temp file + rename — the canonical target is
 *     never the victim of a half-write.
 *
 * The in-memory {@link SectionEtagStore} primitive (Task 1.9) already proves
 * the per-section conflict math; this module proves the DURABILITY layer that
 * makes INV-7 hold across process restarts (the correctness hole D0-9 calls
 * out: an in-memory-only counter would silently invalidate every in-flight
 * client edit on restart).
 */
import { describe, it, expect } from "vitest";
import { computeEtag } from "@/lib/section-etag";
import {
  PersistentEtagStore,
  type EtagStoreFs,
} from "@/lib/projection/etag-store";
import { SIDECAR_LOCATION } from "@/lib/projection/sidecar";

/**
 * In-memory fake filesystem: a Map<path, content> with the AtomicFs surface
 * plus readFile/readdir. Records the call sequence so the atomic-write test
 * can assert temp+rename ordering.
 */
function makeFakeFs(): EtagStoreFs & {
  files: Map<string, string>;
  calls: string[];
} {
  const files = new Map<string, string>();
  const calls: string[] = [];
  const fs: EtagStoreFs & { files: Map<string, string>; calls: string[] } = {
    files,
    calls,
    async mkdir(dir) {
      calls.push(`mkdir:${dir}`);
    },
    async writeFile(p, data) {
      calls.push(`writeFile:${p}`);
      files.set(p, data);
    },
    async rename(from, to) {
      calls.push(`rename:${from}->${to}`);
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
    async readdir() {
      return [];
    },
  };
  return fs;
}

/** Canonical tasks.md fixture with two checkbox task lines (two sections). */
const TASKS_MD = [
  "## 1. Group",
  "",
  "- [ ] 1.1 first task",
  "- [ ] 1.2 second task",
].join("\n");

describe("task 4.9 — persisted per-project ETag store (D0-9)", () => {
  const PROJECT_ROOT = "/proj";
  const ETAGS_PATH = `${PROJECT_ROOT}/${SIDECAR_LOCATION}etags.json`;
  const TASKS_REL = "openspec/changes/phase0/tasks.md";

  describe("missing etags.json on startup re-derives from disk + resets version to genesis (0)", () => {
    it("seeds every on-disk section at version 0 with a disk-derived ETag", async () => {
      const fs = makeFakeFs();
      // Canonical tasks.md on disk, no etags.json yet.
      fs.files.set(`${PROJECT_ROOT}/${TASKS_REL}`, TASKS_MD);

      const store = new PersistentEtagStore({
        projectRoot: PROJECT_ROOT,
        deriveFiles: [TASKS_REL],
        fs,
      });
      await store.init();

      // Two checkbox sections → two genesis (version-0) ETags.
      const e1 = store.get(TASKS_REL, "line:3");
      const e2 = store.get(TASKS_REL, "line:4");
      expect(e1).toBe(computeEtag("- [ ] 1.1 first task", 0));
      expect(e2).toBe(computeEtag("- [ ] 1.2 second task", 0));

      // The derived state is itself persisted so the next restart loads it
      // directly (no second re-derivation needed).
      const persisted = JSON.parse(fs.files.get(ETAGS_PATH) ?? "{}");
      expect(persisted[TASKS_REL]?.["line:3"]?.version).toBe(0);
      expect(persisted[TASKS_REL]?.["line:3"]?.hash).toBe(e1);
    });

    it("produces NO sections for a read-only main spec (D-MainSpecCRUD)", async () => {
      const fs = makeFakeFs();
      fs.files.set(
        `${PROJECT_ROOT}/openspec/specs/foundations/spec.md`,
        "## Requirements\n...",
      );
      const store = new PersistentEtagStore({
        projectRoot: PROJECT_ROOT,
        deriveFiles: ["openspec/specs/foundations/spec.md"],
        fs,
      });
      await store.init();
      expect(store.list("openspec/specs/foundations/spec.md")).toEqual({});
    });
  });

  describe("restart preserves a client-issued ETag (no spurious 409)", () => {
    it("an ETag issued before a restart still satisfies If-Match after restart", async () => {
      // --- Process 1: derive + first client CREATE. ---
      const fs1 = makeFakeFs();
      fs1.files.set(`${PROJECT_ROOT}/${TASKS_REL}`, TASKS_MD);
      const store1 = new PersistentEtagStore({
        projectRoot: PROJECT_ROOT,
        deriveFiles: [TASKS_REL],
        fs: fs1,
      });
      await store1.init();

      // Client CREATEs a brand-new section (untracked, POST-exempt).
      const create = await store1.commit(
        TASKS_REL,
        "line:99",
        "- [ ] 1.9 new task",
        undefined,
      );
      expect(create.ok).toBe(true);
      const clientEtag = create.ok ? create.etag : "";

      // --- Process 2: restart. etags.json is the ONLY shared state. ---
      const fs2 = makeFakeFs();
      // Carry over the persisted sidecar file (simulating a real disk).
      fs2.files.set(ETAGS_PATH, fs1.files.get(ETAGS_PATH) ?? "{}");

      const store2 = new PersistentEtagStore({
        projectRoot: PROJECT_ROOT,
        deriveFiles: [TASKS_REL],
        fs: fs2,
      });
      await store2.init();

      // The client's pre-restart ETag must still be valid → UPDATE succeeds,
      // NOT a spurious 409.
      const update = await store2.commit(
        TASKS_REL,
        "line:99",
        "- [x] 1.9 done",
        clientEtag,
      );
      expect(update.ok).toBe(true);
    });

    it("does NOT re-derive when etags.json is present (loads persisted versions)", async () => {
      const fs = makeFakeFs();
      fs.files.set(`${PROJECT_ROOT}/${TASKS_REL}`, TASKS_MD);
      // Pre-existing etags.json with a bumped version for line:3.
      const genesis = computeEtag("- [ ] 1.1 first task", 0);
      fs.files.set(
        ETAGS_PATH,
        JSON.stringify({
          [TASKS_REL]: {
            "line:3": { version: 7, hash: computeEtag("- [ ] 1.1 first task", 7) },
          },
        }),
      );

      const store = new PersistentEtagStore({
        projectRoot: PROJECT_ROOT,
        deriveFiles: [TASKS_REL],
        fs,
      });
      await store.init();

      // The persisted version (7) wins; re-derivation (which would reset to
      // genesis 0) did NOT happen.
      expect(store.get(TASKS_REL, "line:3")).toBe(
        computeEtag("- [ ] 1.1 first task", 7),
      );
      expect(store.get(TASKS_REL, "line:3")).not.toBe(genesis);
      // Sibling section was NOT seeded (only the persisted map is loaded).
      expect(store.get(TASKS_REL, "line:4")).toBeUndefined();
    });
  });

  describe("version-file write is atomic (temp+rename)", () => {
    it("writes etags.json via a sibling temp file then renames onto the target", async () => {
      const fs = makeFakeFs();
      fs.files.set(`${PROJECT_ROOT}/${TASKS_REL}`, TASKS_MD);
      const store = new PersistentEtagStore({
        projectRoot: PROJECT_ROOT,
        deriveFiles: [TASKS_REL],
        fs,
      });
      await store.init();

      // Reset the call log so only the bump's write is observed.
      fs.calls.length = 0;

      await store.commit(TASKS_REL, "line:3", "- [x] 1.1 done", store.get(TASKS_REL, "line:3"));

      // The final target is touched ONLY by a rename — never by a bare
      // writeFile to ETAGS_PATH (no half-write window).
      const bareWrites = fs.calls.filter((c) => c === `writeFile:${ETAGS_PATH}`);
      expect(bareWrites).toHaveLength(0);

      // There is exactly one writeFile (to a sibling temp in the same dir)...
      const writes = fs.calls.filter((c) => c.startsWith("writeFile:"));
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain(SIDECAR_LOCATION);
      expect(writes[0]).not.toMatch(/etags\.json$/);

      // ...followed by exactly one rename onto ETAGS_PATH.
      const renames = fs.calls.filter((c) => c.startsWith("rename:"));
      expect(renames).toHaveLength(1);
      expect(renames[0]).toMatch(new RegExp(`->.*${ETAGS_PATH.replace(/\//g, "\\/")}$`));
    });
  });
});
