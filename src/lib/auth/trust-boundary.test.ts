/**
 * Task 6.1 — Agent & webhook trust-boundary matrix (req 09.10).
 *
 * Pure allow/deny decision over (token, verb, path). Default deny; every
 * grant explicit. Enforcement middleware ships in Phase 3b (when agent API +
 * webhooks ship); this is the decision core that middleware plugs into.
 *
 * Defined fields:
 *  - path allowlist (glob patterns)
 *  - allowed-verbs (HTTP verbs)
 *  - max-write-rate (writes per minute per token; default 60)
 *  - `openspec/.dashboard/proposals/` is NOT in the default allowlist.
 */
import { describe, it, expect } from "vitest";
import {
  type TrustBoundary,
  type TrustDecisionInput,
  DEFAULT_MAX_WRITE_RATE_PER_MIN,
  decideTrust,
  matchGlob,
  DEFAULT_AGENT_ALLOWLIST,
} from "./trust-boundary";

const NOW = 1_700_000_000_000;

describe("default agent allowlist (req 09.10)", () => {
  it("does NOT grant write to openspec/.dashboard/proposals/ by default", () => {
    expect(DEFAULT_AGENT_ALLOWLIST).not.toContain("openspec/.dashboard/proposals/**");
    // Also ensure the proposals dir is not matched by any default pattern.
    for (const pat of DEFAULT_AGENT_ALLOWLIST) {
      expect(matchGlob("openspec/.dashboard/proposals/foo.md", pat)).toBe(false);
    }
  });

  it("grants changes tasks.md by default", () => {
    const ok = DEFAULT_AGENT_ALLOWLIST.some((p) =>
      matchGlob("openspec/changes/my-change/tasks.md", p),
    );
    expect(ok).toBe(true);
  });
});

describe("matchGlob", () => {
  it("matches a literal path", () => {
    expect(matchGlob("openspec/changes/c/tasks.md", "openspec/changes/c/tasks.md")).toBe(true);
  });

  it("matches a single-segment wildcard", () => {
    expect(matchGlob("openspec/changes/c/tasks.md", "openspec/changes/*/tasks.md")).toBe(true);
    expect(matchGlob("openspec/changes/c/deltas/d.md", "openspec/changes/*/tasks.md")).toBe(false);
  });

  it("matches a recursive glob **", () => {
    expect(matchGlob("openspec/.dashboard/state.json", "openspec/.dashboard/**")).toBe(true);
    expect(matchGlob("openspec/.dashboard/a/b/c.json", "openspec/.dashboard/**")).toBe(true);
    expect(matchGlob("openspec/changes/c/tasks.md", "openspec/.dashboard/**")).toBe(false);
  });

  it("does not escape the pattern's parent via ..", () => {
    expect(
      matchGlob("openspec/changes/c/../../etc/passwd", "openspec/changes/*/tasks.md"),
    ).toBe(false);
  });
});

describe("decideTrust — path allowlist (default deny)", () => {
  const boundary: TrustBoundary = {
    pathAllowlist: ["openspec/changes/*/tasks.md", "openspec/.dashboard/**"],
    allowedVerbs: ["GET", "PATCH"],
    maxWriteRatePerMin: DEFAULT_MAX_WRITE_RATE_PER_MIN,
  };

  it("denies by default when path does not match any allowlist pattern", () => {
    const r = decideTrust(boundary, {
      verb: "PATCH",
      path: "openspec/specs/foo/spec.md",
      writesInLastMin: 0,
      now: NOW,
    });
    expect(r.allowed).toBe(false);
    expect(r.statusCode).toBe(403);
    expect(r.reason).toMatch(/path|allowlist/i);
  });

  it("allows a GET on a matched path within budget", () => {
    const r = decideTrust(boundary, {
      verb: "GET",
      path: "openspec/.dashboard/state.json",
      writesInLastMin: 0,
      now: NOW,
    });
    expect(r.allowed).toBe(true);
    expect(r.statusCode).toBe(0);
  });
});

describe("decideTrust — allowed-verbs", () => {
  const boundary: TrustBoundary = {
    pathAllowlist: ["openspec/changes/*/tasks.md"],
    allowedVerbs: ["GET", "PATCH"],
    maxWriteRatePerMin: DEFAULT_MAX_WRITE_RATE_PER_MIN,
  };

  it("denies a verb not in allowedVerbs even when the path matches", () => {
    const r = decideTrust(boundary, {
      verb: "DELETE",
      path: "openspec/changes/c/tasks.md",
      writesInLastMin: 0,
      now: NOW,
    });
    expect(r.allowed).toBe(false);
    expect(r.statusCode).toBe(403);
    expect(r.reason).toMatch(/verb|method/i);
  });

  it("verb match is case-insensitive", () => {
    const r = decideTrust(boundary, {
      verb: "patch",
      path: "openspec/changes/c/tasks.md",
      writesInLastMin: 0,
      now: NOW,
    });
    expect(r.allowed).toBe(true);
  });
});

describe("decideTrust — max-write-rate (writes per minute)", () => {
  const boundary: TrustBoundary = {
    pathAllowlist: ["openspec/changes/*/tasks.md"],
    allowedVerbs: ["PATCH"],
    maxWriteRatePerMin: 5,
  };

  it("allows the 5th write of the minute", () => {
    const r = decideTrust(boundary, {
      verb: "PATCH",
      path: "openspec/changes/c/tasks.md",
      writesInLastMin: 4,
      now: NOW,
    });
    expect(r.allowed).toBe(true);
  });

  it("denies the 6th write of the minute with 429", () => {
    const r = decideTrust(boundary, {
      verb: "PATCH",
      path: "openspec/changes/c/tasks.md",
      writesInLastMin: 5,
      now: NOW,
    });
    expect(r.allowed).toBe(false);
    expect(r.statusCode).toBe(429);
    expect(r.reason).toMatch(/rate|writes|per minute/i);
  });

  it("does not count GET against the write budget", () => {
    const boundary2: TrustBoundary = {
      pathAllowlist: ["openspec/changes/*/tasks.md"],
      allowedVerbs: ["GET", "PATCH"],
      maxWriteRatePerMin: 1,
    };
    const r = decideTrust(boundary2, {
      verb: "GET",
      path: "openspec/changes/c/tasks.md",
      writesInLastMin: 999,
      now: NOW,
    });
    expect(r.allowed).toBe(true);
  });
});

describe("decideTrust — default max-write-rate is 60/min", () => {
  it("DEFAULT_MAX_WRITE_RATE_PER_MIN === 60", () => {
    expect(DEFAULT_MAX_WRITE_RATE_PER_MIN).toBe(60);
  });
});

// Type-level sanity.
export type _T = TrustDecisionInput;
