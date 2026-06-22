/**
 * Task 5.1 — Better-Auth integration: RBAC effective-role resolution (req 09.3).
 *
 * Pure effective-role resolution + permission check. This is the core of the
 * `requireProjectRole` middleware (design D-3a2): a single enforcement point
 * resolves the caller's effective role (direct ∪ team-inherited) and applies
 * **deny-by-default** on every project-scoped endpoint.
 *
 *   - req 09.3 (a): permission checks on every endpoint; deny-by-default.
 *
 * Keeping this logic pure lets the decision table be exhaustively unit-tested
 * in isolation from the request/DB layer (D-3a8 — TDD via testing-standard).
 */

/** Per-project roles (req 09.3). Ordered by privilege in `ROLE_RANK`. */
export type Role = "owner" | "editor" | "viewer";

/** Privilege ordering: higher rank = more privileged. */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

/** Inputs to effective-role resolution. */
export interface RoleInput {
  /** The caller's direct per-project role, or null if none. */
  directRole: Role | null;
  /** Per-project roles inherited via team memberships (req 09.4). */
  teamRoles: Role[];
}

/**
 * Resolve the caller's effective role for a project.
 *
 * Effective role = the **highest** privilege among the direct role and all
 * team-inherited roles (direct ∪ team, design D-3a2). Returns `null` when the
 * caller holds no role at all → callers MUST treat `null` as deny-by-default.
 */
export function resolveEffectiveRole(input: RoleInput): Role | null {
  const candidates: Role[] = [];
  if (input.directRole) candidates.push(input.directRole);
  for (const r of input.teamRoles) candidates.push(r);
  if (candidates.length === 0) return null;
  return candidates.reduce<Role>(
    (best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best),
    candidates[0],
  );
}

/**
 * Check whether an effective role satisfies a minimum-required role.
 *
 * Deny-by-default: a `null` effective role never satisfies any requirement.
 */
export function hasPermission(effective: Role | null, minRole: Role): boolean {
  if (effective === null) return false;
  return ROLE_RANK[effective] >= ROLE_RANK[minRole];
}
