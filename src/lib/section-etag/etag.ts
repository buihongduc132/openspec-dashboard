/**
 * Task 1.9 — Per-section ETag store + conflict policy (INV-7).
 *
 * Tracks an independent `monotonicVersion` per (fileKey, sectionKey) and
 * validates `If-Match` on every accepted mutation. The defining invariants:
 *
 *  - ETag = `SHA256(sectionBytes ‖ monotonicVersion)` (see {@link computeEtag}).
 *  - A mutation to section X increments ONLY X's version; sibling sections and
 *    parent blocks are unaffected (minimal invalidation).
 *  - Two concurrent commits to DIFFERENT sections of the same file both
 *    succeed; two concurrent commits to the SAME section reject the loser with
 *    a conflict (409 + merge-UI signal) and do NOT consume a version number.
 *  - Create (POST) of an untracked section is exempt from `If-Match`.
 *
 * Spec source: `flow/requirements/README.md` §"INV-7 Per-section optimistic
 * concurrency".
 */
import { createHash } from "node:crypto";

/**
 * Compute the INV-7 ETag for a section: `SHA256(sectionBytes ‖ monotonicVersion)`.
 *
 * The version is encoded as a fixed-width 64-bit big-endian integer and
 * concatenated with the UTF-8 section bytes, so the hash is a function of the
 * raw concatenation `sectionBytes ‖ monotonicVersion` (unambiguous: the
 * version field has a fixed width, so `bytes="a",version=1` and
 * `bytes="a1",version=0` cannot collide).
 */
export function computeEtag(sectionBytes: string, monotonicVersion: number): string {
  const versionBuf = Buffer.alloc(8);
  versionBuf.writeBigUInt64BE(BigInt(monotonicVersion));
  return createHash("sha256").update(sectionBytes, "utf8").update(versionBuf).digest("hex");
}

/** Current tracked state of one section. */
interface SectionState {
  /** Last accepted section bytes. */
  bytes: string;
  /** Per-section monotonic counter, incremented on every accepted mutation. */
  version: number;
}

/** Outcome of a {@link SectionEtagStore.commit} call. */
export type CommitResult =
  | { ok: true; etag: string }
  | {
      ok: false;
      /** Always `"conflict"` — the only failure mode for `commit`. */
      reason: "conflict";
      /** The current (winning) ETag, for the merge UI. */
      etag: string;
      /** The current section bytes (the winning write). */
      currentBytes: string;
    };

/**
 * Per-section optimistic-concurrency ETag store (INV-7).
 *
 * In-memory and synchronous; durable persistence + HTTP `If-Match`/409 wiring
 * layer on top of this primitive in later MVP tasks. Keys are namespaced by
 * `fileKey` so two files never share section state.
 */
export class SectionEtagStore {
  private readonly states = new Map<string, Map<string, SectionState>>();

  private bucket(fileKey: string): Map<string, SectionState> {
    let b = this.states.get(fileKey);
    if (b === undefined) {
      b = new Map();
      this.states.set(fileKey, b);
    }
    return b;
  }

  /**
   * Record a section's current bytes WITHOUT a version bump. Used on read /
   * first-seen to seed the store from the filesystem so subsequent commits can
   * be conflict-checked. Returns the resulting (version-0) ETag.
   */
  track(fileKey: string, sectionKey: string, sectionBytes: string): string {
    const existing = this.bucket(fileKey).get(sectionKey);
    // Preserve an existing version if the section was already tracked (a read
    // refresh should not regress the version); otherwise seed at version 0.
    const version = existing ? existing.version : 0;
    const state: SectionState = { bytes: sectionBytes, version };
    this.bucket(fileKey).set(sectionKey, state);
    return computeEtag(sectionBytes, version);
  }

  /** Current ETag for `(fileKey, sectionKey)`, or `undefined` if untracked. */
  get(fileKey: string, sectionKey: string): string | undefined {
    const state = this.bucket(fileKey).get(sectionKey);
    return state === undefined ? undefined : computeEtag(state.bytes, state.version);
  }

  /** Snapshot of every tracked section's current ETag within a file. */
  list(fileKey: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [sectionKey, state] of this.bucket(fileKey).entries()) {
      out[sectionKey] = computeEtag(state.bytes, state.version);
    }
    return out;
  }

  /**
   * Validate `ifMatch` against the section's current ETag and, on a match,
   * persist `newBytes` and bump the per-section version. Returns the new ETag
   * on success.
   *
   * Conflict rules (INV-7):
   *  - Tracked section + matching `ifMatch`  → accept (version++).
   *  - Tracked section + mismatched `ifMatch`→ reject (409), no version bump.
   *  - Tracked section + omitted `ifMatch`   → reject (a tracked section MUST
   *    present a valid ETag; only CREATE is exempt).
   *  - Untracked section + omitted `ifMatch` → accept as a CREATE (lands at
   *    version 1 — the first accepted mutation).
   *  - Untracked section + provided `ifMatch`→ reject (cannot match a section
   *    that does not exist).
   */
  commit(
    fileKey: string,
    sectionKey: string,
    newBytes: string,
    ifMatch: string | undefined,
  ): CommitResult {
    const bucket = this.bucket(fileKey);
    const state = bucket.get(sectionKey);

    // CREATE: untracked section is exempt from If-Match (INV-7 POST exemption).
    if (state === undefined) {
      if (ifMatch !== undefined) {
        return {
          ok: false,
          reason: "conflict",
          etag: "",
          currentBytes: "",
        };
      }
      const version = 1; // first accepted mutation
      bucket.set(sectionKey, { bytes: newBytes, version });
      return { ok: true, etag: computeEtag(newBytes, version) };
    }

    // UPDATE: a tracked section requires a valid matching If-Match.
    if (ifMatch === undefined || ifMatch !== computeEtag(state.bytes, state.version)) {
      return {
        ok: false,
        reason: "conflict",
        etag: computeEtag(state.bytes, state.version),
        currentBytes: state.bytes,
      };
    }

    const version = state.version + 1;
    bucket.set(sectionKey, { bytes: newBytes, version });
    return { ok: true, etag: computeEtag(newBytes, version) };
  }
}
