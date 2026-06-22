/**
 * Task 6.1 — Per-user API tokens with project + role scope (req 09.5).
 *
 * Pure issuance + scope-validation + revocation/last-used primitives. Token
 * creation requires **step-up auth** (req 09.5 (b)); tokens are scoped
 * (project X, role Editor) and NEVER global-admin by default (req 09.5 (a)).
 * Revocation flips an immutable `revoked` flag; last-used is recorded via
 * {@link recordUse}. The token secret is never stored — only its SHA-256 hash
 * (req 09.8 / NFR-10 style; matches the auth-token-at-rest contract).
 *
 * The DB wiring (Better-Auth token table) is owned by the detailed Phase-3b
 * persistence tasks; this is the decision core they plug into.
 *
 * Source: req 09 §9.5.
 */
import { createHash, randomBytes } from "node:crypto";
import { ROLE_RANK, type Role } from "./rbac";

/** Injectable monotonic clock (milliseconds). */
export type Clock = () => number;

/**
 * A token's scope. Always (project, role) — never "global admin" by default
 * (req 09.5 (a)). A `role: "owner"` is still scoped to `projectId`, so it is
 * NOT global-admin (see {@link isGlobalAdmin}).
 */
export interface ApiTokenScope {
  /** The single project this token may touch. */
  projectId: string;
  /** The role the token acts with on that project. */
  role: Role;
}

/** A persisted API token (the secret is shown only at issuance). */
export interface ApiToken {
  /** Stable token id (used to look up the row). */
  id: string;
  /**
   * The opaque bearer secret. Shown ONCE at issuance; only `secretHash` is
   * persisted thereafter. Kept on this object so tests can model the
   * issuance path without a real store.
   */
  secret: string;
  /** SHA-256 hex of `secret` — the value persisted at rest. */
  secretHash: string;
  /** Owning user. */
  userId: string;
  /** The token's scope. */
  scope: ApiTokenScope;
  /** Issued-at timestamp (ms). */
  createdAt: number;
  /** Last-used timestamp (ms), or null if never used. */
  lastUsedAt: number | null;
  /** Whether the token has been revoked. */
  revoked: boolean;
}

/** Inputs to {@link issueApiToken}. */
export interface IssueApiTokenInput {
  userId: string;
  scope: ApiTokenScope;
  /**
   * Whether the caller has freshly re-authenticated (step-up auth, req 09.5
   * (b)). MUST be true to issue a token.
   */
  isSteppedUp: boolean;
  /** Injectable clock (defaults to `Date.now`). */
  clock?: Clock;
}

/** Successful outcome of {@link issueApiToken}. */
export interface IssueApiTokenOk {
  ok: true;
  token: ApiToken;
}

/** Failed outcome of {@link issueApiToken}. */
export interface IssueApiTokenErr {
  ok: false;
  reason: string;
}

/** Result of {@link issueApiToken}. */
export type IssueApiTokenResult = IssueApiTokenOk | IssueApiTokenErr;

/**
 * Issue a scoped API token (req 09.5).
 *
 * Requires step-up auth (`isSteppedUp === true`); otherwise refuses with a
 * clear reason. The secret is 32 bytes of crypto randomness presented as
 * hex; the row persists only its SHA-256 hash.
 */
export function issueApiToken(input: IssueApiTokenInput): IssueApiTokenResult {
  if (!input.isSteppedUp) {
    return {
      ok: false,
      reason: "token creation requires step-up re-authentication",
    };
  }

  const now = (input.clock ?? Date.now)();
  const secret = randomBytes(32).toString("hex");
  const id = randomBytes(16).toString("hex");
  const token: ApiToken = {
    id,
    secret,
    secretHash: sha256(secret),
    userId: input.userId,
    scope: { ...input.scope },
    createdAt: now,
    lastUsedAt: null,
    revoked: false,
  };
  return { ok: true, token };
}

/** Inputs to a scope-validation check. */
export interface ScopeCheckInput {
  /** The project the request targets. */
  projectId: string;
  /** The minimum role the endpoint requires. */
  minRole: Role;
}

/**
 * Whether a token's scope authorizes a request against `check`.
 *
 * `true` when the token's project matches AND its role is at least the
 * minimum required role. Tokens are scoped by construction
 * (req 09.5 (a)); there is no implicit grant.
 */
export function validateScope(scope: ApiTokenScope, check: ScopeCheckInput): boolean {
  if (scope.projectId !== check.projectId) return false;
  return rank(scope.role) >= rank(check.minRole);
}

/**
 * Whether a scope grants global-admin privileges.
 *
 * Always `false` — every scope is per-project (req 09.5 (a)). Exposed so
 * callers/tests can assert the invariant: a scoped token is NEVER
 * global-admin.
 */
export function isGlobalAdmin(_scope: ApiTokenScope): boolean {
  return false;
}

/**
 * Revoke a token. Returns a copy with `revoked: true`. Idempotent.
 */
export function revokeToken(token: ApiToken): ApiToken {
  return { ...token, revoked: true };
}

/**
 * Record that a token was used at `clock()`'s current time.
 *
 * Refuses to advance `lastUsedAt` on a revoked token — callers MUST reject
 * revoked tokens before reaching this path, and this guard keeps the audit
 * semantics honest.
 */
export function recordUse(token: ApiToken, clock: Clock = Date.now): ApiToken {
  if (token.revoked) return token;
  return { ...token, lastUsedAt: clock() };
}

// --- helpers -----------------------------------------------------------------

function rank(role: Role): number {
  return ROLE_RANK[role];
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
