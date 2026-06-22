/**
 * Task sidecar JSON identity layer (req 04 §4.1, D-StableTaskIDs) +
 * deterministic reconciliation algorithm (req 04 §4.21, task 2.19).
 *
 * Barrel re-exporting the sidecar schema, path helpers, serialization,
 * first-seen UUID migrator, and the §4.21 reconciler.
 */
export {
  SIDECAR_DIR,
  SIDECAR_VERSION,
  TUPLE_KEY_SEPARATOR,
  sidecarPath,
  emptySidecar,
  serializeSidecar,
  parseSidecar,
  sidecarKey,
  migrateSidecar,
  type SidecarTaskEntry,
  type SidecarFile,
  type SidecarTaskTuple,
  type UuidFactory,
} from "./sidecar";

export {
  LOW_CONFIDENCE_THRESHOLD,
  reconcileTasks,
  type ReconcileTuple,
  type ReconcileEntry,
  type ReconcileBinding,
  type ReconcileOrphan,
  type ReconcileAdvisory,
  type ReconcileResult,
} from "./reconcile";
