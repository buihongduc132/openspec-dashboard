/**
 * Task 4.10 (GREEN) — persisted per-project ETag store (INV-7, design D0-9).
 *
 * The in-memory {@link SectionEtagStore} (Task 1.9) proves the per-section
 * conflict math but loses all version state on process restart — an
 * in-memory-only `monotonicVersion` changes every ETag on restart, silently
 * invalidating every in-flight client edit and producing false 409s. That is a
 * correctness hole (D0-9), not an optimization, so the per-section versions
 * are persisted to a single `etags.json` per project in the sidecar and
 * reloaded on startup BEFORE any mutating endpoint is served.
 *
 * Behaviour (filesystem-projection spec "Per-section ETag concurrency
 * (INV-7)" + decision D0-9):
 *
 *  - **Load on startup:** if `etags.json` exists, the persisted version map is
 *    loaded verbatim (no re-derivation — a bump that landed before the restart
 *    must survive). If `etags.json` is MISSING, the store re-derives sections
 *    from the canonical files on disk and seeds each at version 0 (genesis),
 *    so a fresh client can begin optimistic concurrency from the disk truth.
 *  - **Commit:** same CREATE/UPDATE/conflict semantics as
 *    {@link SectionEtagStore}, but every accepted mutation bumps the persisted
 *    version via an ATOMIC write (temp file + rename) so a crash mid-bump
 *    never leaves a half-written `etags.json`.
 *  - **Section granularity:** reuses {@link splitSections} /
 *    {@link artifactKindForPath} so the persisted keys match the Section
 *    Granularity Table exactly.
 *
 * The persisted shape is a two-level map keyed by `fileKey` then `sectionKey`
 * (the design's `{ sectionKey → { version, hash } }` generalised to preserve
 * the `(fileKey, sectionKey)` namespacing INV-7 requires):
 *
 *   ```json
 *   {
 *     "openspec/changes/phase0/tasks.md": {
 *       "line:3": { "version": 7, "hash": "<etag>" }
 *     }
 *   }
 *   ```
 *
 * `hash` is the full INV-7 ETag (`SHA256(sectionBytes ‖ version)`); storing it
 * (rather than the raw bytes) means the store never needs to hold section
 * bytes between commits — the request supplies the new bytes, and `If-Match`
 * is validated against the persisted hash directly.
 */
import {
  computeEtag,
  splitSections,
  artifactKindForPath,
} from "@/lib/section-etag";
import { resolveSidecar } from "@/lib/projection/sidecar";
import { writeFileAtomic } from "@/lib/filesystem-projection";

/** Relative sub-path of the per-project ETag sidecar file. */
const ETAGS_REL = "etags.json";

/**
 * Injectable filesystem surface required by {@link PersistentEtagStore}.
 * Mirrors {@link AtomicFs} plus `readFile` (for loading the sidecar + the
 * canonical files) and `readdir` (reserved for future directory scanning).
 */
export interface EtagStoreFs {
  mkdir(dir: string, opts: { recursive: boolean }): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  /** Read a file, or return `null` if it does not exist. */
  readFile(path: string): Promise<string | null>;
  readdir(path: string): Promise<string[]>;
}

/** Persisted state of a single section. */
interface PersistedSection {
  /** Per-section monotonic counter, bumped on every accepted mutation. */
  version: number;
  /** The full INV-7 ETag `SHA256(sectionBytes ‖ version)`. */
  hash: string;
}

/** On-disk JSON shape of the per-project `etags.json`. */
type EtagFile = Record<string, Record<string, PersistedSection>>;

/** Outcome of a {@link PersistentEtagStore.commit} — mirrors SectionEtagStore. */
export type CommitResult =
  | { ok: true; etag: string }
  | { ok: false; reason: "conflict"; etag: string };

/** Options for {@link PersistentEtagStore}. */
export interface PersistentEtagStoreOptions {
  /** Absolute project root the sidecar path resolves against. */
  projectRoot: string;
  /**
   * Canonical file paths (relative to `projectRoot`) to re-derive sections
   * from when `etags.json` is missing on startup. The projection layer knows
   * which files it is tracking, so it supplies this set explicitly.
   */
  deriveFiles?: string[];
  /** Injectable filesystem (tests pass a fake; prod uses {@link nodeEtagFs}). */
  fs?: EtagStoreFs;
}

/**
 * Persisted per-project section ETag store.
 *
 * Call {@link init} exactly once on startup (before any mutating endpoint is
 * served) to load-or-derive the version map; afterwards {@link commit} /
 * {@link get} / {@link list} are synchronous and auto-persist on every
 * accepted mutation.
 */
export class PersistentEtagStore {
  private readonly projectRoot: string;
  private readonly deriveFiles: string[];
  private readonly fs: EtagStoreFs;
  /** In-memory mirror of the persisted file; keyed fileKey → sectionKey. */
  private readonly state: EtagFile = {};

  constructor(opts: PersistentEtagStoreOptions) {
    this.projectRoot = opts.projectRoot;
    this.deriveFiles = opts.deriveFiles ?? [];
    this.fs = opts.fs ?? nodeEtagFs;
  }

  /**
   * Resolve the `etags.json` sidecar path lazily (at every use) rather than
   * capturing it in the constructor, so a D0-5 constant flip AFTER
   * construction still relocates the file. The location is the single source
   * of truth; reading it at use-time is what makes the flip atomic.
   */
  private get etagsPath(): string {
    return resolveSidecar(this.projectRoot, ETAGS_REL);
  }

  /**
   * Load the persisted version map, or — if `etags.json` is absent — re-derive
   * it from the canonical files on disk (seeding every section at genesis
   * version 0) and persist the derived map. Idempotent: safe to call once at
   * startup.
   */
  async init(): Promise<void> {
    const raw = await this.fs.readFile(this.etagsPath);
    if (raw !== null) {
      // Persisted map wins — a pre-restart bump must survive unchanged.
      const parsed = parseEtagFile(raw);
      for (const [fileKey, sections] of Object.entries(parsed)) {
        this.state[fileKey] = { ...sections };
      }
      return;
    }
    // Missing sidecar: re-derive from disk at genesis (version 0).
    await this.rederiveFromDisk();
  }

  /**
   * Re-derive every section of {@link deriveFiles} from disk, seeding each at
   * version 0, and persist the result. Used on first start (no `etags.json`)
   * so a fresh client can begin optimistic concurrency from the disk truth.
   */
  private async rederiveFromDisk(): Promise<void> {
    for (const rel of this.deriveFiles) {
      const abs = `${this.projectRoot}/${rel}`;
      const content = await this.fs.readFile(abs);
      if (content === null) continue; // file not tracked yet — skip silently.
      const kind = artifactKindForPath(rel);
      const sections = splitSections(kind, content);
      if (sections.length === 0) continue;
      const bucket: Record<string, PersistedSection> = {};
      for (const s of sections) {
        bucket[s.key] = { version: 0, hash: computeEtag(s.bytes, 0) };
      }
      this.state[rel] = bucket;
    }
    await this.persist();
  }

  /** Current ETag for `(fileKey, sectionKey)`, or `undefined` if untracked. */
  get(fileKey: string, sectionKey: string): string | undefined {
    return this.state[fileKey]?.[sectionKey]?.hash;
  }

  /** Snapshot of every tracked section's current ETag within a file. */
  list(fileKey: string): Record<string, string> {
    const bucket = this.state[fileKey];
    if (!bucket) return {};
    const out: Record<string, string> = {};
    for (const [sectionKey, s] of Object.entries(bucket)) {
      out[sectionKey] = s.hash;
    }
    return out;
  }

  /**
   * Validate `ifMatch` and, on success, bump the per-section version + persist
   * atomically. Semantics mirror {@link SectionEtagStore.commit}:
   *
   *  - Untracked + no `ifMatch`  → CREATE (lands at version 1).
   *  - Untracked + `ifMatch`     → conflict (cannot match a non-existent section).
   *  - Tracked + matching `ifMatch` → accept (version++).
   *  - Tracked + missing/mismatched `ifMatch` → conflict (409), no bump.
   *
   * The atomic persist happens AFTER the in-memory bump so a crash between
   * bump and persist at most loses the bump (the client can retry; the
   * on-disk file is never half-written).
   */
  async commit(
    fileKey: string,
    sectionKey: string,
    newBytes: string,
    ifMatch: string | undefined,
  ): Promise<CommitResult> {
    const bucket = this.state[fileKey] ?? (this.state[fileKey] = {});
    const current = bucket[sectionKey];

    // CREATE: untracked section is exempt from If-Match (INV-7 POST exemption).
    if (current === undefined) {
      if (ifMatch !== undefined) {
        return { ok: false, reason: "conflict", etag: "" };
      }
      const version = 1;
      const hash = computeEtag(newBytes, version);
      bucket[sectionKey] = { version, hash };
      await this.persist();
      return { ok: true, etag: hash };
    }

    // UPDATE: a tracked section requires a valid matching If-Match.
    if (ifMatch === undefined || ifMatch !== current.hash) {
      return { ok: false, reason: "conflict", etag: current.hash };
    }

    const version = current.version + 1;
    const hash = computeEtag(newBytes, version);
    bucket[sectionKey] = { version, hash };
    await this.persist();
    return { ok: true, etag: hash };
  }

  /**
   * Atomically persist the current in-memory version map to `etags.json`
   * (temp file + rename). Awaited from {@link commit} so a successful commit
   * guarantees the bump reached disk before the caller observes the new ETag;
   * a persist failure rejects back through `commit` so the mutating-endpoint
   * layer can surface a faithful 5xx (the in-memory bump already happened, so
   * the next reload re-reads the on-disk file which is never half-written).
   */
  private persist(): Promise<void> {
    return writeFileAtomic(
      this.etagsPath,
      JSON.stringify(this.state, null, 2),
      this.fs,
    );
  }
}

/** Parse and validate the on-disk `etags.json`, tolerating an empty/corrupt file. */
function parseEtagFile(raw: string): EtagFile {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as EtagFile;
    }
  } catch {
    // fall through — a corrupt sidecar is treated as "start fresh".
  }
  return {};
}

/** Default production filesystem binding for {@link PersistentEtagStore}. */
export const nodeEtagFs: EtagStoreFs = {
  // Lazy requires keep this module importable in environments that mock fs.
  async mkdir(dir, opts) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, opts);
  },
  async writeFile(path, data) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, data, "utf8");
  },
  async rename(from, to) {
    const { rename } = await import("node:fs/promises");
    await rename(from, to);
  },
  async unlink(path) {
    const { unlink } = await import("node:fs/promises");
    await unlink(path);
  },
  async readFile(path) {
    const { readFile } = await import("node:fs/promises");
    try {
      return await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  },
  async readdir(path) {
    const { readdir } = await import("node:fs/promises");
    return readdir(path);
  },
};
