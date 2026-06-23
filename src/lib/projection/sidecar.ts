/**
 * Single sidecar-location constant (design D0-5, §0.1 Gate 1, req 08 §8.9).
 *
 * The dashboard writes private state (ETag versions, audit chain, task sidecars,
 * schema-fork manifests) into a sidecar directory that the upstream OpenSpec
 * validator must IGNORE. Every spec requirement + every call site that writes
 * dashboard-private state reads through this single constant, so that the
 * location can be flipped atomically if the upstream tooling ever starts
 * traversing the sidecar dir.
 *
 * **Gate 1 outcome (empirical, 2026-06-23, OpenSpec v1.4.1):** `openspec
 * validate --all` produces ZERO findings that reference `openspec/.dashboard/`
 * when files are planted there. The default in-tree path is therefore correct
 * and the fallback (`.openspec-dashboard/`) is NOT required. See
 * `flow/findings/2026-06-20_openspec-upstream-gates.md` Gate 1.
 *
 * If Gate 1 ever fails in a future OpenSpec release, change ONLY this constant
 * to `.openspec-dashboard/` and every sidecar path relocates atomically.
 */
export const SIDECAR_LOCATION = "openspec/.dashboard/";

/**
 * The ACTIVE sidecar location. Production reads the {@link SIDECAR_LOCATION}
 * default; the {@link __setSidecarLocationForTest} seam is the ONLY mutator.
 * Every sidecar path is resolved through this value (never a per-call-site
 * literal), which is what makes D0-5's "change ONLY the constant" promise
 * hold: one source of truth, atomic relocation.
 */
let activeSidecarLocation = SIDECAR_LOCATION;

/** The currently active sidecar location (defaults to {@link SIDECAR_LOCATION}). */
export function sidecarLocation(): string {
  return activeSidecarLocation;
}

/**
 * Join the sidecar location with a relative sub-path (e.g. `etags.json`,
 * `audit/chain.log`). Returned as a POSIX-style path relative to the project
 * root, so it composes with the project root at the projection layer.
 */
export function sidecarPath(relativePath: string): string {
  return `${activeSidecarLocation}${relativePath}`;
}

/**
 * Resolve a sidecar sub-path against an absolute project root, yielding a
 * filesystem path usable by `fs` APIs.
 */
export function resolveSidecar(projectRoot: string, relativePath: string): string {
  // node:path.posix.join would normalize away the trailing slash semantics we
  // rely on; a manual join keeps SIDECAR_LOCATION the single source of truth.
  const root = projectRoot.endsWith("/") ? projectRoot : `${projectRoot}/`;
  return `${root}${sidecarPath(relativePath)}`;
}

/**
 * TEST-ONLY seam (design D0-5): simulate the operator changing ONLY the
 * `SIDECAR_LOCATION` constant. Flips the active location so every sidecar
 * consumer (etag-store, task sidecar, audit chain, …) relocates atomically in
 * one move, proving no consumer hardcodes the prefix. Returns a `reset()`
 * that restores the default; tests MUST call it in a `finally` block.
 *
 * Production code MUST NOT call this — the only legitimate production change
 * is editing the `SIDECAR_LOCATION` constant itself.
 */
export function __setSidecarLocationForTest(location: string): () => void {
  activeSidecarLocation = location;
  return () => {
    activeSidecarLocation = SIDECAR_LOCATION;
  };
}
