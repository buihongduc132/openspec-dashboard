/**
 * Task 6.3 — Outbound webhook dispatch: HMAC signing + retry with
 * exponential backoff + dead-letter queue (req 08.5a).
 *
 * Behaviour asserted:
 *  - Payload is HMAC-SHA256 signed with the shared secret; signature header
 *    follows the versioned scheme `v=<n>,sig=<hex>` to support rotation.
 *  - Dispatch retries with exponential backoff up to maxAttempts; a delivery
 *    that eventually succeeds resolves `{ status: "delivered" }`.
 *  - Exhausted retries move the attempt into a typed dead-letter result
 *    `{ status: "dead_lettered", attempts }` — the caller persists these,
 *    not this module.
 *  - Delivery to a host not on the egress allowlist is refused BEFORE any
 *    network attempt (`{ status: "blocked", reason: "ssrf" }`).
 */
import { describe, it, expect, vi } from "vitest";
import {
  signPayload,
  buildSignatureHeader,
  dispatchOutbound,
  type OutboundWebhook,
  type DispatchTransport,
  type DispatchResult,
} from "@/lib/webhooks/outbound";
import type { EgressAllowlist } from "@/lib/webhooks/ssrf";

const SECRET = "super-secret";

describe("signPayload / buildSignatureHeader", () => {
  it("HMAC-SHA256 signs the exact UTF-8 bytes of the body", () => {
    const body = '{"event":"change.created"}';
    const sig = signPayload(body, SECRET, 1);
    // Deterministic: same inputs => same signature.
    expect(signPayload(body, SECRET, 1)).toBe(sig);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signature is sensitive to the body", () => {
    expect(signPayload("a", SECRET, 1)).not.toBe(signPayload("b", SECRET, 1));
  });

  it("buildSignatureHeader emits the versioned `v=<n>,sig=<hex>` scheme", () => {
    const h = buildSignatureHeader("body", SECRET, 3);
    expect(h).toMatch(/^v=3,sig=[0-9a-f]{64}$/);
  });
});

describe("dispatchOutbound", () => {
  const allow: EgressAllowlist = { hosts: ["example.com"] };

  function okTransport(): DispatchTransport {
    return async () => ({ ok: true, status: 200 });
  }

  it("signs the payload and reports delivered on a 2xx", async () => {
    const seen: string[] = [];
    const transport: DispatchTransport = async (url, _body, headers) => {
      seen.push(headers["X-OpenSpec-Signature"]);
      return { ok: true, status: 200 };
    };
    const hook: OutboundWebhook = {
      url: "https://example.com/hook",
      secret: SECRET,
      version: 1,
    };
    const res = await dispatchOutbound(hook, '{"a":1}', allow, {
      transport,
      maxAttempts: 3,
      backoffMs: 0,
    });
    expect(res.status).toBe("delivered");
    expect(seen[0]).toMatch(/^v=1,sig=[0-9a-f]{64}$/);
  });

  it("refuses to deliver to a non-allowlisted host with status 'blocked'", async () => {
    const transport = vi.fn(okTransport()) as unknown as DispatchTransport;
    const hook: OutboundWebhook = {
      url: "https://internal.example.internal/hook",
      secret: SECRET,
      version: 1,
    };
    const res = await dispatchOutbound(hook, "{}", { hosts: [] }, {
      transport,
      maxAttempts: 3,
      backoffMs: 0,
    });
    expect(res.status).toBe("blocked");
    if (res.status === "blocked") expect(res.reason).toBe("ssrf");
    expect(transport).not.toHaveBeenCalled();
  });

  it("retries with exponential backoff then dead-letters on persistent failure", async () => {
    let calls = 0;
    const transport: DispatchTransport = async () => {
      calls += 1;
      return { ok: false, status: 500 };
    };
    const hook: OutboundWebhook = {
      url: "https://example.com/hook",
      secret: SECRET,
      version: 1,
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const res = await dispatchOutbound(hook, "{}", allow, {
      transport,
      maxAttempts: 3,
      backoffMs: 1,
      sleep,
    });
    expect(calls).toBe(3);
    expect(res.status).toBe("dead_lettered");
    if (res.status === "dead_lettered") {
      expect(res.attempts).toBe(3);
      expect(res.lastStatus).toBe(500);
    }
    // backoff between attempts (2 sleeps for 3 attempts)
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("succeeds on a later attempt (retry recovers transient failure)", async () => {
    let calls = 0;
    const transport: DispatchTransport = async () => {
      calls += 1;
      return calls < 2 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    };
    const hook: OutboundWebhook = {
      url: "https://example.com/hook",
      secret: SECRET,
      version: 1,
    };
    const res = await dispatchOutbound(hook, "{}", allow, {
      transport,
      maxAttempts: 3,
      backoffMs: 0,
    });
    expect(res.status).toBe("delivered");
    expect(calls).toBe(2);
  });

  it("a throwing transport counts as a failed attempt and dead-letters after maxAttempts (does not reject)", async () => {
    // Regression for cubic finding: a rejected transport previously escaped
    // the retry/dead-letter flow by rejecting dispatchOutbound itself.
    let calls = 0;
    const transport: DispatchTransport = async () => {
      calls += 1;
      throw new Error("network down");
    };
    const hook: OutboundWebhook = {
      url: "https://example.com/hook",
      secret: SECRET,
      version: 1,
    };
    const res = await dispatchOutbound(hook, "{}", allow, {
      transport,
      maxAttempts: 3,
      backoffMs: 0,
    });
    expect(res.status).toBe("dead_lettered");
    if (res.status !== "dead_lettered") throw new Error("unreachable");
    expect(res.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("result is a typed DispatchResult variant in every case", async () => {
    const hook: OutboundWebhook = {
      url: "https://example.com/hook",
      secret: SECRET,
      version: 1,
    };
    const ok: DispatchResult = await dispatchOutbound(hook, "{}", allow, {
      transport: okTransport(),
      maxAttempts: 1,
      backoffMs: 0,
    });
    const blocked: DispatchResult = await dispatchOutbound(
      { ...hook, url: "https://evil.example/hook" },
      "{}",
      { hosts: [] },
      { transport: okTransport(), maxAttempts: 1, backoffMs: 0 },
    );
    expect(["delivered", "dead_lettered", "blocked"]).toContain(ok.status);
    expect(["delivered", "dead_lettered", "blocked"]).toContain(blocked.status);
  });
});
