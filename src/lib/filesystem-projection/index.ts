/**
 * Task 1.8 — Filesystem projection (Markdown ↔ in-memory) + atomic writes.
 *
 * Public surface:
 *  - {@link writeFileAtomic}: write-to-temp + rename atomic write primitive.
 *  - {@link serializeMainSpec} / {@link serializeDeltaSpec} / {@link serializeTasks}:
 *    project the parsed in-memory model back to upstream OpenSpec Markdown.
 *  - {@link projectChange} / {@link projectProject}: emit the model to disk
 *    atomically.
 *
 * Spec source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "Filesystem projection with
 * atomic writes"; req 01 §1.4, INV-7).
 */
export {
  writeFileAtomic,
  nodeFs,
  type AtomicFs,
  type ProjectionFs,
} from "./atomic-write";
export {
  serializeTasks,
  serializeMainSpec,
  serializeDeltaSpec,
} from "./serialize";
export { projectChange, projectProject } from "./project";
