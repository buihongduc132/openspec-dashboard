/**
 * Task 6.3 — Agent JSON API: scoped token enforcement (req 08.6b / 09.10).
 *
 * Behaviour asserted:
 *  - Default deny: a token with no grants can do nothing.
 *  - path-allowlist: glob patterns; `openspec/.dashboard/proposals/` is NOT
 *    in the default allowlist and must be granted explicitly to propose
 *    delta specs.
 *  - `config.yaml` is NEVER writable unless explicitly granted.
 *  - allowed-verbs: default deny; only granted verbs pass.
 *  - "Propose delta spec" write creates a pending-review artifact under
 *    `openspec/.dashboard/proposals/` and returns a preview URL — but the
 *    write is gated by an explicit proposals grant.
 *  - max-write-rate: writes-per-minute per token; over-rate is rejected.
 */
import { describe, it, expect } from "vitest";
import {
  defaultTokenScope,
  authorizeWrite,
  proposeDeltaSpec,
  type AgentTokenScope,
} from "@/lib/agent-api/scope";

describe("defaultTokenScope (req 09.10 default deny)", () => {
  it("default scope denies all writes", () => {
    const s = defaultTokenScope();
    expect(s.pathAllowlist).toEqual([]);
    expect(s.allowedVerbs).toEqual([]);
    expect(s.maxWriteRatePerMin).toBe(60);
    expect(s.canProposeDeltaSpec).toBe(false);
  });
});

describe("authorizeWrite (req 08.6b / 09.10)", () => {
  const base: AgentTokenScope = {
    projectId: "proj-1",
    pathAllowlist: ["openspec/changes/*/tasks.md", "openspec/.dashboard/**"],
    allowedVerbs: ["GET", "PATCH"],
    maxWriteRatePerMin: 60,
    canProposeDeltaSpec: false,
  };

  it("denies a verb not in allowed-verbs", () => {
    const r = authorizeWrite(base, "DELETE", "openspec/changes/x/tasks.md", 0);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("verb");
  });

  it("denies a path not matching the allowlist (default deny)", () => {
    const r = authorizeWrite(base, "PATCH", "openspec/config.yaml", 0);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("path");
  });

  it("allows a path matching a glob in the allowlist", () => {
    const r = authorizeWrite(base, "PATCH", "openspec/changes/feat-x/tasks.md", 0);
    expect(r.allowed).toBe(true);
  });

  it("config.yaml is NEVER writable unless explicitly granted", () => {
    // even if an explicit glob matched it, the hard guard rejects config.yaml
    const grantsConfig: AgentTokenScope = {
      ...base,
      pathAllowlist: ["openspec/config.yaml"],
      allowedVerbs: ["PATCH"],
    };
    const r = authorizeWrite(
      { ...grantsConfig, explicitlyAllowConfigYaml: true },
      "PATCH",
      "openspec/config.yaml",
      0,
    );
    expect(r.allowed).toBe(true);

    // but without explicit grant, even a matching glob is refused
    const r2 = authorizeWrite(
      grantsConfig,
      "PATCH",
      "openspec/config.yaml",
      0,
    );
    expect(r2.allowed).toBe(false);
    if (!r2.allowed) expect(r2.reason).toBe("config_yaml");
  });

  it("enforces max-write-rate per minute", () => {
    const limited: AgentTokenScope = { ...base, maxWriteRatePerMin: 2 };
    expect(
      authorizeWrite(limited, "PATCH", "openspec/changes/x/tasks.md", 0).allowed,
    ).toBe(true);
    expect(
      authorizeWrite(limited, "PATCH", "openspec/changes/x/tasks.md", 1).allowed,
    ).toBe(true);
    const over = authorizeWrite(
      limited,
      "PATCH",
      "openspec/changes/x/tasks.md",
      2,
    );
    expect(over.allowed).toBe(false);
    if (!over.allowed) expect(over.reason).toBe("rate");
  });
});

describe("proposeDeltaSpec (req 08.6c)", () => {
  const canPropose: AgentTokenScope = {
    projectId: "proj-1",
    pathAllowlist: ["openspec/changes/**"],
    allowedVerbs: ["POST"],
    maxWriteRatePerMin: 60,
    canProposeDeltaSpec: true,
  };

  it("rejects when the token lacks canProposeDeltaSpec", () => {
    const r = proposeDeltaSpec(
      { ...canPropose, canProposeDeltaSpec: false },
      "feat-x",
      "dashboard-foundation",
      "## ADDED Requirements\n...",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_authorized");
  });

  it("creates a pending-review artifact and returns a preview URL", () => {
    const r = proposeDeltaSpec(
      canPropose,
      "feat-x",
      "dashboard-foundation",
      "## ADDED Requirements\n### Requirement: X\n",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.artifactPath).toMatch(
        /^openspec\/\.dashboard\/proposals\//,
      );
      expect(r.artifactPath).toContain("feat-x");
      expect(r.previewUrl).toContain("/changes/feat-x");
      expect(r.status).toBe("pending_review");
    }
  });
});
