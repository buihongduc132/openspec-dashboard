/**
 * Task 6.2 — Git integration (clone, sync, branch ops).
 *
 * Public surface for the per-project Git integration module.
 *
 * Spec source: req 08 §8.4 in `flow/requirements/08-integration-sync.md`
 * + "Sandboxed clone (M-7 hardened)" in
 * `openspec/changes/build-openspec-dashboard-mvp/specs/project-workspace/spec.md`.
 */
export {
  COMMIT_PREFIX,
  buildCommitMessage,
  parseCommitMessage,
  buildBranchName,
  parseBranchName,
  defaultGitIntegrationConfig,
  validateGitIntegrationConfig,
  cloneSandboxed,
  syncFromRemote,
  createChangeBranch,
  commitStructured,
  pushBranch,
  type GitSpawnImpl,
  type GitOpOptions,
  type GitIntegrationConfig,
  type ParsedCommitMessage,
  type ParsedBranchName,
  type SyncResult,
} from "./git";
