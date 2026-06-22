/**
 * Task 6.3 — SSRF egress guard for outbound webhooks (req 08.5a).
 *
 * Spec source: req 08 §8.5 (a) in
 * `flow/requirements/08-integration-sync.md`.
 *
 * Behaviour asserted:
 *  - Default egress allowlist is EMPTY → everything is blocked unless
 *    explicitly allowed.
 *  - A denylist (RFC1918, link-local 169.254/16, CGNAT 100.64/10, cloud
 *    metadata 169.254.169.254 / fd00:ec2::254, loopback) is enforced ON TOP
 *    of the allowlist — even an operator who allowlists a private range by
 *    mistake is still blocked.
 */
import { describe, it, expect } from "vitest";
import { isEgressAllowed, type EgressAllowlist } from "@/lib/webhooks/ssrf";

describe("SSRF egress guard (req 08.5a)", () => {
  it("default-deny: blocks everything when allowlist is empty", () => {
    const empty: EgressAllowlist = { hosts: [] };
    expect(isEgressAllowed("https://example.com/hook", empty)).toBe(false);
    expect(isEgressAllowed("https://1.2.3.4/hook", empty)).toBe(false);
  });

  it("allows an explicitly-allowed host", () => {
    const allow: EgressAllowlist = { hosts: ["example.com"] };
    expect(isEgressAllowed("https://example.com/hook", allow)).toBe(true);
  });

  it("enforces denylist on top of allowlist: RFC1918 stays blocked", () => {
    // operator misconfiguration: allowlist a private host
    const allow: EgressAllowlist = { hosts: ["10.0.0.5", "192.168.1.1"] };
    expect(isEgressAllowed("https://10.0.0.5/", allow)).toBe(false);
    expect(isEgressAllowed("https://192.168.1.1/", allow)).toBe(false);
    expect(isEgressAllowed("https://172.16.5.4/", allow)).toBe(false);
  });

  it("blocks link-local (169.254/16) and cloud metadata IPs", () => {
    const allow: EgressAllowlist = { hosts: ["169.254.169.254", "169.254.1.1"] };
    expect(isEgressAllowed("http://169.254.169.254/latest/meta-data", allow)).toBe(false);
    expect(isEgressAllowed("http://169.254.1.1/", allow)).toBe(false);
  });

  it("blocks CGNAT 100.64/10", () => {
    const allow: EgressAllowlist = { hosts: ["100.64.0.1"] };
    expect(isEgressAllowed("https://100.64.0.1/", allow)).toBe(false);
  });

  it("blocks loopback", () => {
    const allow: EgressAllowlist = { hosts: ["127.0.0.1", "localhost"] };
    expect(isEgressAllowed("http://127.0.0.1:8080/", allow)).toBe(false);
    expect(isEgressAllowed("http://localhost/", allow)).toBe(false);
  });

  it("blocks IPv6 loopback and cloud metadata", () => {
    const allow: EgressAllowlist = { hosts: ["::1", "fd00:ec2::254"] };
    expect(isEgressAllowed("http://[::1]/", allow)).toBe(false);
    expect(isEgressAllowed("http://[fd00:ec2::254]/", allow)).toBe(false);
  });

  it("host matching is case-insensitive and ignores port", () => {
    const allow: EgressAllowlist = { hosts: ["EXAMPLE.com"] };
    expect(isEgressAllowed("https://example.com:443/hook", allow)).toBe(true);
  });
});
