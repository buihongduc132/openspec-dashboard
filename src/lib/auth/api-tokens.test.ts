/**
 * Task 6.1 — Per-user API tokens with project + role scope (req 09.5).
 *
 * Pure token issuance + scope-validation primitives. Token creation requires
 * step-up auth (verified by an `isSteppedUp` flag at issuance time); tokens
 * are scoped (project X, role Editor) and NEVER global-admin by default.
 * Revocation + last-used tracking are modeled as immutable transitions.
 */
import { describe, it, expect } from "vitest";
import {
  type ApiToken,
  type ApiTokenScope,
  issueApiToken,
  validateScope,
  revokeToken,
  recordUse,
  isGlobalAdmin,
} from "./api-tokens";

const NOW = 1_700_000_000_000;
const clock = () => NOW;

describe("API token issuance (req 09.5 (a)/(b))", () => {
  it("refuses to issue when the caller has not stepped up (step-up auth)", () => {
    const r = issueApiToken({
      userId: "u1",
      scope: { projectId: "p1", role: "editor" },
      isSteppedUp: false,
      clock,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/step.up|re-auth/i);
  });

  it("issues a scoped token with a non-empty opaque secret + a hash of it", () => {
    const r = issueApiToken({
      userId: "u1",
      scope: { projectId: "p1", role: "editor" },
      isSteppedUp: true,
      clock,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.token.id).toBeTruthy();
      expect(r.token.secret).toBeTruthy();
      expect(r.token.secret.length).toBeGreaterThanOrEqual(32);
      expect(r.token.secretHash).toBeTruthy();
      expect(r.token.secretHash).not.toBe(r.token.secret);
      expect(r.token.scope.projectId).toBe("p1");
      expect(r.token.scope.role).toBe("editor");
      expect(r.token.revoked).toBe(false);
      expect(r.token.lastUsedAt).toBeNull();
      expect(r.token.createdAt).toBe(NOW);
    }
  });
});

describe("scope validation (req 09.5 (a))", () => {
  it("allows access when the token scope covers the requested project + minimum role", () => {
    const scope: ApiTokenScope = { projectId: "p1", role: "editor" };
    expect(validateScope(scope, { projectId: "p1", minRole: "viewer" })).toBe(true);
    expect(validateScope(scope, { projectId: "p1", minRole: "editor" })).toBe(true);
  });

  it("denies access for a different project", () => {
    const scope: ApiTokenScope = { projectId: "p1", role: "editor" };
    expect(validateScope(scope, { projectId: "p2", minRole: "viewer" })).toBe(false);
  });

  it("denies access when the token role is below the minimum", () => {
    const scope: ApiTokenScope = { projectId: "p1", role: "viewer" };
    expect(validateScope(scope, { projectId: "p1", minRole: "editor" })).toBe(false);
  });

  it("a scoped token is never global-admin", () => {
    const scope: ApiTokenScope = { projectId: "p1", role: "owner" };
    expect(isGlobalAdmin(scope)).toBe(false);
  });
});

describe("revocation + last-used tracking (req 09.5)", () => {
  it("revokes a token (subsequent use should be rejected by callers)", () => {
    const issued = issueApiToken({
      userId: "u1",
      scope: { projectId: "p1", role: "editor" },
      isSteppedUp: true,
      clock,
    });
    if (!issued.ok) throw new Error("expected issuance");
    const revoked = revokeToken(issued.token);
    expect(revoked.revoked).toBe(true);
  });

  it("records last-used timestamp on use", () => {
    const issued = issueApiToken({
      userId: "u1",
      scope: { projectId: "p1", role: "editor" },
      isSteppedUp: true,
      clock,
    });
    if (!issued.ok) throw new Error("expected issuance");
    const used = recordUse(issued.token, () => NOW + 5000);
    expect(used.lastUsedAt).toBe(NOW + 5000);
    expect(used.revoked).toBe(false);
  });

  it("recordUse refuses to update a revoked token", () => {
    const issued = issueApiToken({
      userId: "u1",
      scope: { projectId: "p1", role: "editor" },
      isSteppedUp: true,
      clock,
    });
    if (!issued.ok) throw new Error("expected issuance");
    const revoked = revokeToken(issued.token);
    const used = recordUse(revoked, () => NOW + 5000);
    // last-used must NOT advance on a revoked token.
    expect(used.lastUsedAt).toBeNull();
    expect(used.revoked).toBe(true);
  });
});

// Type-level sanity: ApiToken carries enough to identify the token to callers.
export type _ApiTokenShape = ApiToken;
