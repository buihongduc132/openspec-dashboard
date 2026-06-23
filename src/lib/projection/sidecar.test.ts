import { describe, it, expect } from "vitest";
import { SIDECAR_LOCATION, sidecarPath, resolveSidecar } from "./sidecar";

describe("SIDECAR_LOCATION constant (D0-5 / §0.1 Gate 1)", () => {
  it("exposes a single switchable sidecar location", () => {
    expect(typeof SIDECAR_LOCATION).toBe("string");
    expect(SIDECAR_LOCATION.length).toBeGreaterThan(0);
  });

  it("is the empirically-confirmed default (Gate 1 PASS): openspec/.dashboard/", () => {
    // Gate 1 outcome: `openspec validate` produces ZERO findings traversing
    // `openspec/.dashboard/`, so the default constant is the in-tree path.
    expect(SIDECAR_LOCATION).toBe("openspec/.dashboard/");
  });

  it("ends with a trailing slash so concatenation is path-safe", () => {
    expect(SIDECAR_LOCATION.endsWith("/")).toBe(true);
  });

  it("sidecarPath joins the location with a relative sub-path", () => {
    expect(sidecarPath("etags.json")).toBe("openspec/.dashboard/etags.json");
    expect(sidecarPath("audit/chain.log")).toBe(
      "openspec/.dashboard/audit/chain.log",
    );
  });

  it("resolveSidecar resolves against a project root", () => {
    expect(resolveSidecar("/repo", "etags.json")).toBe(
      "/repo/openspec/.dashboard/etags.json",
    );
  });
});
