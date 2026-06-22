/**
 * Task 1.9 — Per-section ETag (INV-7) implementation.
 *
 * Implements the per-section optimistic-concurrency invariant INV-7 from
 * `flow/requirements/README.md`:
 *
 *   Mutating endpoints require `If-Match` on a **section-scoped ETag**. A
 *   "section" is defined per artifact type in the **Section Granularity Table**
 *   (see {@link splitSections} / {@link artifactKindForPath}). ETag =
 *   `SHA256(sectionBytes ‖ monotonicVersion)`, where `monotonicVersion` is a
 *   per-section counter incremented on every accepted mutation.
 *   `sectionBytes` = the bytes of the section itself ONLY (parent blocks are
 *   NOT part of the hash), so editing two different task lines in the same
 *   group both succeed without invalidating each other. A mutation to section
 *   X invalidates ONLY X. Two users editing the SAME section get a 409 + merge
 *   UI. Create operations (POST) are exempt from `If-Match` (the section does
 *   not yet exist).
 *
 * Spec source:
 *  - `openspec/changes/build-openspec-dashboard-mvp/specs/dashboard-foundation/
 *    spec.md` (Requirement "Filesystem projection with atomic writes"; the two
 *    concurrent-edit scenarios).
 *  - `flow/requirements/README.md` §"INV-7" + §"Section Granularity Table".
 *
 * This module is the layer Task 1.8's projection sits on top of; the HTTP
 * `If-Match`/409 plumbing that consumes {@link SectionEtagStore} arrives in
 * later MVP tasks.
 */
export { computeEtag, SectionEtagStore, type CommitResult } from "./etag";
export {
  splitSections,
  artifactKindForPath,
  type ArtifactKind,
  type Section,
} from "./split";
