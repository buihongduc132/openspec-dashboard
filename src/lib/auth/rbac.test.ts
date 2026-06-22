/**
 * Task 5.1 — Better-Auth integration: RBAC effective-role resolution (req 09.3).
 *
 * req 09.3 "Project permissions (RBAC)":
 *   (a) Permission checks on every endpoint; **deny-by-default**.
 *
 * D-3a2: a single `requireProjectRole` middleware resolves the caller's
 * effective role (direct ∪ team-inherited) and enforces deny-by-default.
 * The effective-role resolution is a pure function — these tests pin its
 * decision table.
 */
import { describe, it, expect } from "vitest";
import {
  ROLE_RANK,
  resolveEffectiveRole,
  hasPermission,
  type Role,
  type RoleInput,
} from "@/lib/auth/rbac";

describe("ROLE_RANK ordering", () => {
  it("ranks owner > editor > viewer", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.editor);
    expect(ROLE_RANK.editor).toBeGreaterThan(ROLE_RANK.viewer);
  });
});

describe("resolveEffectiveRole (deny-by-default)", () => {
  it("returns null (deny) when caller has no direct or team role", () => {
    const input: RoleInput = { directRole: null, teamRoles: [] };
    expect(resolveEffectiveRole(input)).toBeNull();
  });

  it("returns the direct role when only a direct role exists", () => {
    expect(resolveEffectiveRole({ directRole: "viewer", teamRoles: [] })).toBe(
      "viewer",
    );
    expect(resolveEffectiveRole({ directRole: "editor", teamRoles: [] })).toBe(
      "editor",
    );
    expect(resolveEffectiveRole({ directRole: "owner", teamRoles: [] })).toBe(
      "owner",
    );
  });

  it("returns the team role when only a team role exists", () => {
    expect(resolveEffectiveRole({ directRole: null, teamRoles: ["editor"] })).toBe(
      "editor",
    );
  });

  it("takes the HIGHEST of direct ∪ team-inherited (D-3a2 union)", () => {
    // direct viewer + team editor → editor
    expect(
      resolveEffectiveRole({ directRole: "viewer", teamRoles: ["editor"] }),
    ).toBe("editor");
    // direct editor + team viewer → editor
    expect(
      resolveEffectiveRole({ directRole: "editor", teamRoles: ["viewer"] }),
    ).toBe("editor");
  });

  it("direct owner is preserved even if a team grants a lower role", () => {
    expect(
      resolveEffectiveRole({ directRole: "owner", teamRoles: ["viewer"] }),
    ).toBe("owner");
  });

  it("deduplicates identical team roles", () => {
    expect(
      resolveEffectiveRole({
        directRole: null,
        teamRoles: ["editor", "editor", "viewer"],
      }),
    ).toBe("editor");
  });
});

describe("hasPermission (deny-by-default)", () => {
  it("denies when effective role is null", () => {
    expect(hasPermission(null, "viewer")).toBe(false);
  });

  it.each([
    ["owner", "viewer", true],
    ["owner", "editor", true],
    ["owner", "owner", true],
    ["editor", "viewer", true],
    ["editor", "editor", true],
    ["editor", "owner", false],
    ["viewer", "viewer", true],
    ["viewer", "editor", false],
    ["viewer", "owner", false],
  ] as Array<[Role, Role, boolean]>)(
    "hasPermission(%s, %s) === %s",
    (effective, min, expected) => {
      expect(hasPermission(effective, min)).toBe(expected);
    },
  );
});
