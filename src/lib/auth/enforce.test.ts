/**
 * Task 5.2 — RBAC + permissions enforcement (req 09.3 (a)).
 *
 * D-3a2: a single `requireProjectRole` enforcement point resolves the
 * caller's effective role and applies **deny-by-default** on every
 * project-scoped endpoint. The pure role-resolution primitives
 * (`resolveEffectiveRole` / `hasPermission`) were pinned in 5.1; these
 * tests pin the enforcement decision table that wraps them for the HTTP
 * layer: local-mode bypass, 401 unauthenticated, 403 forbidden, and the
 * allow path.
 *
 *   - req 09.1: local mode → single local user, no auth, full access.
 *   - req 09.3 (a): permission checks on every endpoint; deny-by-default.
 */
import { describe, it, expect } from "vitest";
import {
  requireProjectRole,
  toNextResponse,
  type AuthorizationDecision,
} from "@/lib/auth/enforce";
import type { RoleInput } from "@/lib/auth/rbac";

/** Convenience: build a role resolver that returns a fixed RoleInput. */
function fixedRoles(roles: RoleInput) {
  return async () => roles;
}

describe("requireProjectRole — local mode (req 09.1)", () => {
  it("grants full access in local mode regardless of caller (single local user)", async () => {
    const decision = await requireProjectRole({
      authMode: "local",
      callerId: null,
      projectId: "p1",
      minRole: "owner",
      resolveRoles: async () => ({ directRole: null, teamRoles: [] }),
    });
    expect(decision.allowed).toBe(true);
    expect(decision.statusCode).toBe(0);
  });

  it("does not call the role resolver in local mode (no auth)", async () => {
    let called = false;
    const decision = await requireProjectRole({
      authMode: "local",
      callerId: "someone",
      projectId: "p1",
      minRole: "viewer",
      resolveRoles: async () => {
        called = true;
        return { directRole: null, teamRoles: [] };
      },
    });
    expect(called).toBe(false);
    expect(decision.allowed).toBe(true);
  });
});

describe("requireProjectRole — multi-user mode deny-by-default (req 09.3 (a))", () => {
  it("returns 401 when there is no authenticated caller", async () => {
    const decision = await requireProjectRole({
      authMode: "multi",
      callerId: null,
      projectId: "p1",
      minRole: "viewer",
      resolveRoles: async () => ({ directRole: null, teamRoles: [] }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.statusCode).toBe(401);
    expect(decision.reason).toMatch(/authenticat/i);
  });

  it("returns 403 when caller has NO role on the project (deny-by-default)", async () => {
    const decision = await requireProjectRole({
      authMode: "multi",
      callerId: "u1",
      projectId: "p1",
      minRole: "viewer",
      resolveRoles: fixedRoles({ directRole: null, teamRoles: [] }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.statusCode).toBe(403);
    expect(decision.reason).toMatch(/forbidden|insufficient|permission/i);
  });

  it("returns 403 when caller's effective role is BELOW the minimum", async () => {
    const decision = await requireProjectRole({
      authMode: "multi",
      callerId: "u1",
      projectId: "p1",
      minRole: "owner",
      resolveRoles: fixedRoles({ directRole: "viewer", teamRoles: [] }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.statusCode).toBe(403);
  });

  it("allows when caller's effective role MEETS the minimum (direct)", async () => {
    const decision = await requireProjectRole({
      authMode: "multi",
      callerId: "u1",
      projectId: "p1",
      minRole: "editor",
      resolveRoles: fixedRoles({ directRole: "editor", teamRoles: [] }),
    });
    expect(decision.allowed).toBe(true);
    expect(decision.statusCode).toBe(0);
  });

  it("allows when caller's effective role EXCEEDS the minimum (owner vs viewer)", async () => {
    const decision = await requireProjectRole({
      authMode: "multi",
      callerId: "u1",
      projectId: "p1",
      minRole: "viewer",
      resolveRoles: fixedRoles({ directRole: "owner", teamRoles: [] }),
    });
    expect(decision.allowed).toBe(true);
  });

  it("allows when a team-inherited role satisfies the minimum (direct ∪ team)", async () => {
    // direct viewer, but team editor → effective editor satisfies editor-min.
    const decision = await requireProjectRole({
      authMode: "multi",
      callerId: "u1",
      projectId: "p1",
      minRole: "editor",
      resolveRoles: fixedRoles({ directRole: "viewer", teamRoles: ["editor"] }),
    });
    expect(decision.allowed).toBe(true);
  });

  it("passes callerId + projectId to the role resolver", async () => {
    let seen: { caller?: string; project?: string } = {};
    await requireProjectRole({
      authMode: "multi",
      callerId: "u42",
      projectId: "p77",
      minRole: "viewer",
      resolveRoles: async (caller, project) => {
        seen = { caller, project };
        return { directRole: "viewer", teamRoles: [] };
      },
    });
    expect(seen).toEqual({ caller: "u42", project: "p77" });
  });
});

describe("toNextResponse — HTTP layer adapter", () => {
  it("returns null when the decision is allowed (handler proceeds)", () => {
    const allowed: AuthorizationDecision = {
      allowed: true,
      statusCode: 0,
      reason: "",
    };
    expect(toNextResponse(allowed)).toBeNull();
  });

  it("returns a NextResponse with the decision's status + reason when denied", async () => {
    const res = toNextResponse({
      allowed: false,
      statusCode: 403,
      reason: "forbidden: insufficient role",
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe("forbidden: insufficient role");
  });
});
