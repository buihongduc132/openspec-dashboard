/**
 * Task 6.1 — Team management with session invalidation (req 09.4).
 *
 * Group users into teams and assign team-level project roles (req 09.4 (b)).
 * Invite tokens are single-use and expire after a default TTL (req 09.4 (a)).
 * The session-version stamp force-reload of roles is owned by the
 * middleware layer; this module exposes the pure primitives:
 *   - {@link issueInvite}     — mint a single-use invite token with a TTL.
 *   - {@link consumeInvite}   — verify + consume (single-use, expiry-aware).
 *   - {@link propagateTeamRoles} — derive per-project roles from team
 *     memberships for {@link ./rbac#resolveEffectiveRole}.
 *
 * The clock is injectable so the expiry arithmetic is deterministic under
 * test (D-3a8 — pure decision tables).
 *
 * Source: req 09 §9.4.
 */

import { randomBytes as nodeRandomBytes } from "node:crypto";

/** Per-project roles reused from {@link ./rbac}. */
import type { Role } from "./rbac";

/** Default invite-token TTL: 7 days (req 09.4 (a)). */
export const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Injectable monotonic clock (milliseconds). */
export type Clock = () => number;

/** An outstanding team-invite token. */
export interface TeamInvite {
  /** Opaque single-use token presented by the invitee in the redeem step. */
  token: string;
  /** Team the invite grants membership in. */
  teamId: string;
  /** Email the invite was sent to. */
  email: string;
  /** Per-project role granted on acceptance. */
  role: Role;
  /** Issued-at timestamp (ms). */
  issuedAt: number;
  /** Expiry timestamp (ms) — `issuedAt + ttlMs`. */
  expiresAt: number;
  /** Whether the invite has already been consumed (single-use). */
  consumed: boolean;
}

/** Inputs to {@link issueInvite}. */
export interface IssueInviteInput {
  teamId: string;
  email: string;
  role: Role;
  /** Injectable clock (defaults to `Date.now`). */
  clock?: Clock;
  /** TTL override in ms (defaults to {@link DEFAULT_INVITE_TTL_MS}). */
  ttlMs?: number;
  /** Injectable RNG returning `n` bytes of randomness (defaults to crypto). */
  randomBytes?: (n: number) => string;
}

/** A team-scoped per-project role grant (the membership a team carries). */
export interface TeamRoleGrant {
  teamId: string;
  projectId: string;
  role: Role;
}

/** Inputs to {@link propagateTeamRoles}. */
export interface TeamRoleInput {
  /** Team memberships the caller currently holds. */
  teams: TeamRoleGrant[];
}

/**
 * Issue a single-use invite token that expires after the TTL.
 *
 * The token is an opaque 32-byte hex string from a crypto-grade source (or
 * the injectable `randomBytes` in tests).
 */
export function issueInvite(input: IssueInviteInput): TeamInvite {
  const now = (input.clock ?? Date.now)();
  const ttl = input.ttlMs ?? DEFAULT_INVITE_TTL_MS;
  const token = (input.randomBytes ?? defaultRandomHex)(32);
  return {
    token,
    teamId: input.teamId,
    email: input.email,
    role: input.role,
    issuedAt: now,
    expiresAt: now + ttl,
    consumed: false,
  };
}

/** Successful outcome of {@link consumeInvite}. */
export interface ConsumeInviteOk {
  ok: true;
  invite: TeamInvite;
  membership: { teamId: string; email: string; role: Role };
}

/** Failed outcome of {@link consumeInvite}. */
export interface ConsumeInviteErr {
  ok: false;
  reason: string;
}

/** Result of {@link consumeInvite}. */
export type ConsumeInviteResult = ConsumeInviteOk | ConsumeInviteErr;

/**
 * Verify + consume an invite token.
 *
 * Returns `{ ok: true, membership, invite }` when:
 *  - the token matches the stored token;
 *  - the invite is not yet consumed (single-use — req 09.4 (a));
 *  - the invite has not expired (`expiresAt` strictly in the future).
 *
 * The returned `invite` carries `consumed: true` so callers can persist the
 * single-use consumption. On any failure returns `{ ok: false, reason }` and
 * does NOT mutate the invite.
 */
export function consumeInvite(
  invite: TeamInvite,
  presentedToken: string,
  opts: { clock?: Clock } = {},
): ConsumeInviteResult {
  const now = (opts.clock ?? Date.now)();

  if (invite.token !== presentedToken) {
    return { ok: false, reason: "invalid token: token mismatch" };
  }
  if (invite.consumed) {
    return { ok: false, reason: "invalid token: invite already consumed (single-use)" };
  }
  if (now >= invite.expiresAt) {
    return { ok: false, reason: "invalid token: invite expired" };
  }

  return {
    ok: true,
    invite: { ...invite, consumed: true },
    membership: { teamId: invite.teamId, email: invite.email, role: invite.role },
  };
}

/**
 * Derive the per-project roles the caller holds via team memberships
 * (req 09.4 (b) — team membership/role changes propagate to derived project
 * roles). The result is the list of roles the caller has on `projectId` via
 * their teams; {@link ./rbac#resolveEffectiveRole} collapses them with the
 * caller's direct role to a single effective role.
 *
 * Returns an empty array when the caller is on no team scoped to the project
 * (deny-by-default — the caller then has no team-derived role).
 */
export function propagateTeamRoles(input: TeamRoleInput, projectId: string): Role[] {
  return input.teams
    .filter((t) => t.projectId === projectId)
    .map((t) => t.role);
}

/** Default RNG: `n` hex chars from `node:crypto`. */
function defaultRandomHex(n: number): string {
  return nodeRandomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);
}
