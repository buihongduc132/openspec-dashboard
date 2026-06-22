/**
 * Task 5.2 — RBAC + permissions enforcement (req 09.3 (a)).
 *
 * D-3a2: a single `requireProjectRole` enforcement point resolves the
 * caller's effective role (direct ∪ team-inherited) and applies
 * **deny-by-default** on every project-scoped endpoint. This module wraps the
 * pure primitives from `./rbac` (`resolveEffectiveRole` / `hasPermission`)
 * into an HTTP-layer authorization decision.
 *
 *   - req 09.1: local mode → single local user, no auth, full access.
 *   - req 09.3 (a): permission checks on every endpoint; deny-by-default.
 *
 * The role resolver is injected so the decision table is exhaustively
 * unit-testable in isolation from the request/DB layer (D-3a8). The DB
 * membership/team wiring (Better-Auth sessions, project_memberships table)
 * is owned by the detailed Phase-3a tasks; this is the enforcement core they
 * plug into.
 */
import { NextResponse } from "next/server";
import {
  type Role,
  type RoleInput,
  resolveEffectiveRole,
  hasPermission,
} from "./rbac";
import type { AuthMode } from "./local-mode";

/** Outcome of a `requireProjectRole` authorization check. */
export interface AuthorizationDecision {
  /** Whether the caller may proceed to the handler. */
  allowed: boolean;
  /**
   * HTTP status to emit when denied: `401` (no authenticated caller) or
   * `403` (insufficient role). `0` when allowed.
   */
  statusCode: number;
  /** Human-readable reason (empty string when allowed). */
  reason: string;
}

/** Inputs to the project-role enforcement point. */
export interface RequireProjectRoleInput {
  /** Resolved authentication mode (local | multi). */
  authMode: AuthMode;
  /**
   * Caller identity (session user id / API-token subject). `null` means
   * anonymous / unauthenticated.
   */
  callerId: string | null;
  /** The project being accessed. */
  projectId: string;
  /** Minimum role required by the endpoint. */
  minRole: Role;
  /**
   * Resolves the caller's direct + team-inherited roles for the project.
   * Only invoked in multi-user mode (req 09.4 — team roles propagate to
   * derived project roles).
   */
  resolveRoles: (
    callerId: string,
    projectId: string,
  ) => Promise<RoleInput>;
}

/**
 * Resolve whether the caller may access the given project endpoint.
 *
 * Decision logic (deny-by-default):
 *  - **Local mode** (req 09.1): the single local user is granted full
 *    access; the role resolver is NOT consulted.
 *  - **Multi-user mode**:
 *    - no `callerId` → `401` (unauthenticated);
 *    - effective role is `null` → `403` (no role on the project);
 *    - effective role below `minRole` → `403` (insufficient);
 *    - otherwise → allowed.
 */
export async function requireProjectRole(
  input: RequireProjectRoleInput,
): Promise<AuthorizationDecision> {
  // Local mode (req 09.1): single local user, no auth, full access.
  if (input.authMode === "local") {
    return { allowed: true, statusCode: 0, reason: "" };
  }

  // Multi-user mode — no authenticated caller.
  if (input.callerId === null) {
    return {
      allowed: false,
      statusCode: 401,
      reason: "Authentication required to access this project.",
    };
  }

  const roles = await input.resolveRoles(input.callerId, input.projectId);
  const effective = resolveEffectiveRole(roles);

  // Deny-by-default: no role on the project at all.
  if (effective === null) {
    return {
      allowed: false,
      statusCode: 403,
      reason: "Forbidden: caller has no role on this project.",
    };
  }

  if (!hasPermission(effective, input.minRole)) {
    return {
      allowed: false,
      statusCode: 403,
      reason: `Forbidden: requires ${input.minRole} role (effective: ${effective}).`,
    };
  }

  return { allowed: true, statusCode: 0, reason: "" };
}

/**
 * Convert a {@link AuthorizationDecision} into a Next.js response.
 *
 * Returns `null` when the decision is allowed so handlers can short-circuit:
 *
 * ```ts
 * const decision = await requireProjectRole({ ... });
 * const denied = toNextResponse(decision);
 * if (denied) return denied;
 * // ...handler body...
 * ```
 */
export function toNextResponse(
  decision: AuthorizationDecision,
): NextResponse | null {
  if (decision.allowed) return null;
  return NextResponse.json(
    { error: decision.reason },
    { status: decision.statusCode },
  );
}
