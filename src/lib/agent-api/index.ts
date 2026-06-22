/**
 * Task 6.3 — Agent JSON API (req 08.6): scoped-token enforcement for
 * sandboxed agent writes.
 *
 * Public surface for the agent-api subsystem.
 *
 * Spec source: req 08 §8.6 + req 09 §9.10 in
 * `flow/requirements/08-integration-sync.md` / `09-auth-multitenancy.md`.
 */
export {
  defaultTokenScope,
  authorizeWrite,
  globMatch,
  proposeDeltaSpec,
  type AgentTokenScope,
  type WriteAuthResult,
  type ProposeResult,
} from "./scope";
