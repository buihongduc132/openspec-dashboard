/**
 * Task 2.18 — Task sidecar JSON (`openspec/.dashboard/tasks/<change>.json`)
 * + migrator (req 04 §4.1, D-StableTaskIDs).
 *
 * The Markdown `tasks.md` is the DISPLAY layer; this sidecar JSON is the
 * IDENTITY layer. Each task line gets a stable UUID assigned at first-seen
 * and bound by its `(parent-chain, prose)` tuple — the same deterministic
 * key the reconciler (req 04 §4.21, task 2.19) uses to match Markdown lines
 * to sidecar UUIDs. Task numbers (`- [x] 1.2`) are display-only and MUST NOT
 * be used as the binding key.
 *
 * This module is pure + injectable (UUID factory) so it can be unit-tested
 * deterministically. The filesystem I/O composes {@link writeFileAtomic}
 * (task 1.8) at the route layer.
 */
import { randomUUID as nodeRandomUUID } from "node:crypto";
import {
  resolveSidecar,
  sidecarLocation,
} from "@/lib/projection/sidecar";

// ─── Schema constants ───────────────────────────────────────────────────────

/**
 * Canonical sidecar directory under an OpenSpec project root, composed from
 * the single {@link SIDECAR_LOCATION} constant (design D0-5) so a constant
 * flip relocates the task sidecar atomically with every other sidecar
 * consumer. Captured at module load (callers needing a snapshot of the
 * directory string use this); the {@link sidecarPath} resolver reads the
 * constant at CALL time so it honors a D0-5 flip applied after load.
 */
export const SIDECAR_DIR = `${sidecarLocation()}tasks`;

/** Sidecar schema version (bump + migrator-on-load if format evolves). */
export const SIDECAR_VERSION = 1 as const;

// ─── Types ──────────────────────────────────────────────────────────────────

/** A task entry persisted in the sidecar. */
export interface SidecarTaskEntry {
  /** Stable UUID assigned at first-seen (D-StableTaskIDs). */
  uuid: string;
  /** Ordered list of parent-group headings (the binding key's chain part). */
  parentChain: string[];
  /** Task prose (the binding key's prose part). */
  prose: string;
}

/** On-disk sidecar file model. */
export interface SidecarFile {
  version: typeof SIDECAR_VERSION;
  /** Change name (basename of `<change>.json`). */
  change: string;
  /** Task entries in first-seen order. */
  tasks: SidecarTaskEntry[];
}

/** A parsed Markdown task tuple fed to the migrator (from the parser). */
export interface SidecarTaskTuple {
  parentChain: string[];
  prose: string;
}

/** Injectable UUID v4 factory (default uses node:crypto.randomUUID). */
export type UuidFactory = (index: number) => string;

// ─── Path + empty helpers ───────────────────────────────────────────────────

/**
 * Absolute path of a change's sidecar file:
 * `<projectRoot>/<SIDECAR_LOCATION>tasks/<change>.json`.
 *
 * Reads through the single {@link SIDECAR_LOCATION} constant (via
 * {@link resolveSidecar}) so D0-5's atomic-relocation contract holds: change
 * ONLY the constant and this path relocates with everything else.
 */
export function sidecarPath(projectRoot: string, change: string): string {
  return resolveSidecar(projectRoot, `tasks/${change}.json`);
}

/** Create an empty sidecar for `change` (no tasks yet). */
export function emptySidecar(change: string): SidecarFile {
  return { version: SIDECAR_VERSION, change, tasks: [] };
}

// ─── Serialization ──────────────────────────────────────────────────────────

/**
 * Stable, pretty-printed JSON for the sidecar (2-space indent, trailing
 * newline). Stable field order so diffs are reviewable.
 */
export function serializeSidecar(file: SidecarFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

/**
 * Parse + validate a sidecar JSON document. Throws on a schema-version
 * mismatch so the route layer can surface the error rather than silently
 * mishandling an unknown format (INV-2, NFR-5).
 */
export function parseSidecar(text: string): SidecarFile {
  const parsed = JSON.parse(text) as Partial<SidecarFile>;
  if (parsed.version !== SIDECAR_VERSION) {
    throw new Error(
      `Unsupported sidecar schema version: expected ${SIDECAR_VERSION}, got ${String(parsed.version)}`,
    );
  }
  if (typeof parsed.change !== "string") {
    throw new Error("Invalid sidecar: missing or non-string \"change\".");
  }
  if (!Array.isArray(parsed.tasks)) {
    throw new Error("Invalid sidecar: \"tasks\" must be an array.");
  }
  return parsed as SidecarFile;
}

// ─── Migrator ───────────────────────────────────────────────────────────────

/**
 * Build the deterministic lookup key for a `(parentChain, prose)` tuple.
 * Two tuples bind to the same UUID iff their keys are equal. The separator
 * is chosen so parent-chain headings and prose cannot collide (no
 * parent-chain segment may contain the NUL-like delimiter).
 */
export const TUPLE_KEY_SEPARATOR = "\u0000";

/** Canonical key for a tuple/entry used for exact-match binding. */
export function sidecarKey(parentChain: string[], prose: string): string {
  return parentChain.join(TUPLE_KEY_SEPARATOR) + TUPLE_KEY_SEPARATOR + prose;
}

/**
 * Migrate a sidecar against the parsed Markdown tuples:
 *   - For each tuple, if an existing entry has the SAME key, PRESERVE its UUID
 *     (stable identity — D-StableTaskIDs).
 *   - Otherwise assign a fresh UUID from `uuidFactory`.
 *
 * This is the "assign UUID at first-seen" half of the identity layer. The
 * full §4.21 reconciliation (consumed-set, tie-break, orphan flagging) is
 * task 2.19; this migrator performs the straightforward first-seen
 * assignment that bootstraps identity for existing changes.
 *
 * The UUID factory receives the 1-based index of the new UUID being minted
 * so deterministic tests can produce readable UUIDs. The default factory is
 * `node:crypto.randomUUID`.
 *
 * @param existing The current sidecar (use {@link emptySidecar} for a fresh one).
 * @param tuples   Ordered `(parentChain, prose)` tuples parsed from `tasks.md`.
 * @param uuidFactory Optional injectable UUID factory (default: crypto.randomUUID).
 */
export function migrateSidecar(
  existing: SidecarFile,
  tuples: SidecarTaskTuple[],
  uuidFactory: UuidFactory = defaultUuidFactory,
): SidecarFile {
  // Index existing UUIDs by exact key for O(1) stable binding.
  const existingByKey = new Map<string, SidecarTaskEntry>();
  for (const entry of existing.tasks) {
    existingByKey.set(sidecarKey(entry.parentChain, entry.prose), entry);
  }

  const tasks: SidecarTaskEntry[] = [];
  let freshIndex = 0;
  for (const { parentChain, prose } of tuples) {
    const key = sidecarKey(parentChain, prose);
    const hit = existingByKey.get(key);
    if (hit) {
      tasks.push({ ...hit });
    } else {
      freshIndex += 1;
      tasks.push({ uuid: uuidFactory(freshIndex), parentChain, prose });
    }
  }

  return { version: SIDECAR_VERSION, change: existing.change, tasks };
}

// ─── Default UUID factory ───────────────────────────────────────────────────

const defaultUuidFactory: UuidFactory = () => nodeRandomUUID();
