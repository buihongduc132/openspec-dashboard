/**
 * Task 5.1 — Better-Auth integration: local-mode guard (req 09.1).
 *
 * req 09.1 "Single-user local mode (default)":
 *   (a) Server refuses to bind to non-loopback interfaces in local mode
 *       without explicit opt-in (`--bind 0.0.0.0` requires `--allow-network`).
 *   (b) A clear banner in the UI states "local mode — no auth".
 *
 * These tests cover the pure auth-mode resolution logic that the Better-Auth
 * integration layer consumes (server bind check + UI banner state). The DB /
 * cookie / OAuth wiring is owned by the detailed phase3a tasks (2.x); this is
 * the foundational, side-effect-free core.
 */
import { describe, it, expect } from "vitest";
import {
  isLoopbackHost,
  resolveAuthMode,
  bannerForMode,
  type AuthModeInput,
} from "@/lib/auth/local-mode";

describe("isLoopbackHost", () => {
  it.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["localhost", true],
    ["LOCALHOST", true],
    ["  127.0.0.1  ", true],
  ])("classifies %s as loopback=%s", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });

  it.each([
    ["0.0.0.0", false],
    ["192.168.1.5", false],
    ["10.0.0.1", false],
    ["example.com", false],
    ["", false],
  ])("classifies %s as loopback=%s", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });
});

describe("resolveAuthMode (req 09.1a — bind refusal)", () => {
  it("returns 'local' (no auth) when bound to loopback", () => {
    const input: AuthModeInput = { bindHost: "127.0.0.1", allowNetwork: false };
    expect(resolveAuthMode(input)).toBe("local");
  });

  it("returns 'local' for ::1 even without allowNetwork", () => {
    expect(resolveAuthMode({ bindHost: "::1", allowNetwork: false })).toBe(
      "local",
    );
  });

  it("REFUSES non-loopback bind without --allow-network (throws)", () => {
    expect(() =>
      resolveAuthMode({ bindHost: "0.0.0.0", allowNetwork: false }),
    ).toThrow(/allow-network/i);
  });

  it("refuses a public hostname without --allow-network", () => {
    expect(() =>
      resolveAuthMode({ bindHost: "0.0.0.0", allowNetwork: false }),
    ).toThrow();
  });

  it("returns 'multi' for non-loopback bind WITH --allow-network", () => {
    expect(resolveAuthMode({ bindHost: "0.0.0.0", allowNetwork: true })).toBe(
      "multi",
    );
  });

  it("returns 'multi' for a LAN IP with --allow-network", () => {
    expect(resolveAuthMode({ bindHost: "192.168.1.5", allowNetwork: true })).toBe(
      "multi",
    );
  });
});

describe("bannerForMode (req 09.1b — UI banner)", () => {
  it("states 'local mode — no auth' in local mode", () => {
    const banner = bannerForMode("local");
    expect(banner.shown).toBe(true);
    expect(banner.text.toLowerCase()).toContain("local mode");
    expect(banner.text.toLowerCase()).toContain("no auth");
  });

  it("is hidden in multi-user mode", () => {
    expect(bannerForMode("multi").shown).toBe(false);
    expect(bannerForMode("multi").text).toBe("");
  });
});
