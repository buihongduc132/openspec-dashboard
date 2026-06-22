/**
 * Task 2.16 — Change module editors (req 03.1–3.10). Public barrel.
 */
export {
  CHANGE_NAME_PATTERN,
  validateChangeName,
  scaffoldChange,
  MAX_TASK_DEPTH,
  computeTaskDisplayNumber,
  computeArtifactStatus,
  validateChange,
  REQUIRED_ARTIFACT_TYPES,
  DELTA_VERBS,
  type ScaffoldOptions,
  type ScaffoldedFile,
  type ArtifactStatus,
  type ArtifactStatusInput,
  type ValidationIssue,
  type ValidationResult,
  type ArtifactInput,
  type DeltaVerb,
} from "@/lib/changes/changes";
