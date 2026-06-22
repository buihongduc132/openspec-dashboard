/**
 * Task 6.1 — Team management with session invalidation (req 09.4).
 *
 * Pure invite-token + role-propagation primitives for grouping users into
 * teams and assigning team-level project roles. The clock is injectable so
 * expiry arithmetic is deterministic under test.
 */
import { describe, it, expect } from "vitest";
import {
  type TeamInvite,
  type TeamRoleInput,
  propagateTeamRoles,
  issueInvite,
  consumeInvite,
  DEFAULT_INVITE_TTL_MS,
} from "./teams";

const NOW = 1_700_000_000_000;
const clock = () => NOW;

describe("team invite tokens (req 09.4 (a))", () => {
  it("issues invites with a default 7-day TTL and a single-use opaque token", () => {
    const inv = issueInvite({ teamId: "t1", email: "a@x.com", role: "editor", clock });
    expect(inv.token).toBeTruthy();
    expect(inv.token.length).toBeGreaterThanOrEqual(32);
    expect(inv.expiresAt).toBe(NOW + DEFAULT_INVITE_TTL_MS);
    expect(inv.consumed).toBe(false);
  });

  it("default TTL is exactly 7 days", () => {
    expect(DEFAULT_INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("consumes a valid, unexpired invite once (single-use)", () => {
    const inv = issueInvite({ teamId: "t1", email: "a@x.com", role: "viewer", clock });
    const r1 = consumeInvite(inv, inv.token, { clock });
    expect(r1.ok).toBe(true);
    let consumed: TeamInvite | null = null;
    if (r1.ok) {
      expect(r1.membership.teamId).toBe("t1");
      expect(r1.membership.email).toBe("a@x.com");
      expect(r1.membership.role).toBe("viewer");
      expect(r1.invite.consumed).toBe(true);
      consumed = r1.invite;
    }
    // second consume fails — token is single-use.
    const r2 = consumeInvite(consumed ?? inv, inv.token, { clock });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/single.use|already|consumed/i);
  });

  it("rejects an expired invite", () => {
    const inv = issueInvite({ teamId: "t1", email: "a@x.com", role: "viewer", clock });
    const expired = consumeInvite(inv, inv.token, { clock: () => NOW + DEFAULT_INVITE_TTL_MS + 1 });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toMatch(/expired/i);
  });

  it("rejects a wrong token", () => {
    const inv = issueInvite({ teamId: "t1", email: "a@x.com", role: "viewer", clock });
    const r = consumeInvite(inv, "wrong-token", { clock });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/invalid|token|mismatch/i);
  });
});

describe("team role propagation (req 09.4 (b))", () => {
  it("propagates team-level project roles into the derived project role set", () => {
    const input: TeamRoleInput = {
      teams: [
        { teamId: "t1", projectId: "p1", role: "editor" },
        { teamId: "t2", projectId: "p1", role: "viewer" },
        { teamId: "t3", projectId: "p2", role: "owner" },
      ],
    };
    // For project p1 we should get [editor, viewer] (highest = editor).
    const roles = propagateTeamRoles(input, "p1");
    expect(roles.sort()).toEqual(["editor", "viewer"]);
  });

  it("returns an empty array when the user is on no team scoped to the project", () => {
    const roles = propagateTeamRoles(
      { teams: [{ teamId: "t1", projectId: "p9", role: "editor" }] },
      "p1",
    );
    expect(roles).toEqual([]);
  });
});
