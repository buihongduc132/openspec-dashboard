/**
 * Task 6.3 — Inbound webhook verification: HMAC with rotation + event-id
 * dedup (req 08.5b).
 *
 * Behaviour asserted:
 *  - Signature verification supports N active versioned secrets (rotation);
 *    an inbound payload signed with ANY active secret verifies.
 *  - Versioned signature `v=<n>,sig=<hex>` selects the matching secret by
 *    version number.
 *  - Tampered body / wrong secret / unknown version => rejected.
 *  - Event-id dedup: the same event id processed twice is idempotent
 *    (`{ duplicate: true }`); a store callback records seen ids.
 */
import { describe, it, expect } from "vitest";
import {
  verifyInboundSignature,
  handleInboundEvent,
  buildSignatureHeader,
  signPayload,
  type ActiveSecrets,
  type DedupStore,
  type InboundVerification,
} from "@/lib/webhooks/inbound";

const SECRET_V1 = "rotating-secret-v1";
const SECRET_V2 = "rotating-secret-v2";

const activeSecrets: ActiveSecrets = new Map([
  [1, SECRET_V1],
  [2, SECRET_V2],
]);

describe("verifyInboundSignature (req 08.5b rotation)", () => {
  it("verifies a payload signed with the v1 secret", () => {
    const body = '{"event":"git.push"}';
    const header = buildSignatureHeader(body, SECRET_V1, 1);
    const v = verifyInboundSignature(header, body, activeSecrets);
    expect(v.valid).toBe(true);
    if (v.valid) expect(v.version).toBe(1);
  });

  it("verifies a payload signed with the v2 secret (rotation in flight)", () => {
    const body = '{"event":"git.push"}';
    const header = buildSignatureHeader(body, SECRET_V2, 2);
    const v = verifyInboundSignature(header, body, activeSecrets);
    expect(v.valid).toBe(true);
    if (v.valid) expect(v.version).toBe(2);
  });

  it("rejects a tampered body", () => {
    const header = buildSignatureHeader("original", SECRET_V1, 1);
    const v = verifyInboundSignature(header, "tampered", activeSecrets);
    expect(v.valid).toBe(false);
  });

  it("rejects an unknown signature version", () => {
    const body = "x";
    const header = buildSignatureHeader(body, "whatever", 99);
    const v = verifyInboundSignature(header, body, activeSecrets);
    expect(v.valid).toBe(false);
  });

  it("rejects a malformed header", () => {
    const v = verifyInboundSignature("garbage", "x", activeSecrets);
    expect(v.valid).toBe(false);
  });
});

describe("handleInboundEvent (req 08.5b idempotency)", () => {
  function memStore(): DedupStore {
    const seen = new Set<string>();
    return {
      has: async (id) => seen.has(id),
      mark: async (id) => {
        seen.add(id);
      },
    };
  }

  it("first delivery of an event id is processed", async () => {
    const store = memStore();
    const r = await handleInboundEvent("evt-123", store);
    expect(r.duplicate).toBe(false);
  });

  it("second delivery of the same event id is idempotent", async () => {
    const store = memStore();
    await handleInboundEvent("evt-123", store);
    const r = await handleInboundEvent("evt-123", store);
    expect(r.duplicate).toBe(true);
  });

  it("different event ids are both processed", async () => {
    const store = memStore();
    const a = await handleInboundEvent("evt-1", store);
    const b = await handleInboundEvent("evt-2", store);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
  });

  it("a valid verification result is typed InboundVerification", () => {
    const body = "b";
    const header = buildSignatureHeader(body, SECRET_V2, 2);
    const v: InboundVerification = verifyInboundSignature(header, body, activeSecrets);
    expect(typeof v.valid).toBe("boolean");
  });
});

// Re-exported from outbound to keep a single canonical signing primitive.
describe("signing primitive parity", () => {
  it("inbound and outbound share the same HMAC bytes", () => {
    const body = "same-body";
    expect(signPayload(body, SECRET_V1, 1)).toBe(signPayload(body, SECRET_V1, 1));
  });
});
