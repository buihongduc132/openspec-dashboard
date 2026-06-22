/**
 * Task 6.3 — Inbound webhook verification (req 08.5b).
 *
 * Spec source: req 08 §8.5 (b) in
 * `flow/requirements/08-integration-sync.md`.
 *
 * Contract:
 *   - HMAC verification supports **N active versioned secrets** (rotation).
 *     An inbound payload signed with ANY active secret verifies.
 *   - Signatures follow the versioned scheme `v=<n>,sig=<hex>`; the version
 *     selects the matching secret, then the hex is recomputed over the body.
 *   - Tampered body / unknown version / wrong secret => rejected.
 *   - Event-id dedup: a {@link DedupStore} records seen event ids so the
 *     same event processed twice is idempotent ({@link handleInboundEvent}
 *     returns `{ duplicate: true }`).
 *
 * The dedup store is injectable (D-MPCD-5) so policy is unit-testable.
 */
import {
  signPayload,
  buildSignatureHeader,
} from "./outbound";

export { signPayload, buildSignatureHeader };

/** Map of active signature version -> shared secret. */
export type ActiveSecrets = Map<number, string>;

/** Outcome of {@link verifyInboundSignature}. */
export type InboundVerification =
  | { valid: true; version: number }
  | { valid: false; reason: "malformed" | "unknown_version" | "bad_signature" };

/**
 * Parse a versioned signature header `v=<n>,sig=<hex>` into its parts.
 * Returns `null` when the header does not match the scheme.
 */
export function parseSignatureHeader(
  header: string,
): { version: number; sig: string } | null {
  const m = /^v=(\d+),sig=([0-9a-fA-F]+)$/.exec(header.trim());
  if (!m) return null;
  return { version: parseInt(m[1], 10), sig: m[2].toLowerCase() };
}

/**
 * Verify an inbound payload against the set of active rotating secrets.
 *
 * Rotation is supported by selecting the secret whose version matches the
 * header's `v=<n>`, then recomputing the HMAC over the body. A tampered
 * body or an unknown version is rejected.
 */
export function verifyInboundSignature(
  header: string,
  body: string,
  activeSecrets: ActiveSecrets,
): InboundVerification {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, reason: "malformed" };
  const secret = activeSecrets.get(parsed.version);
  if (!secret) return { valid: false, reason: "unknown_version" };
  const expected = signPayload(body, secret, parsed.version).toLowerCase();
  if (constantTimeEqual(expected, parsed.sig)) {
    return { valid: true, version: parsed.version };
  }
  return { valid: false, reason: "bad_signature" };
}

/** Injectable event-id dedup store (e.g. Redis SET, Postgres unique). */
export interface DedupStore {
  has(id: string): Promise<boolean>;
  mark(id: string): Promise<void>;
}

/** Result of {@link handleInboundEvent}. */
export interface InboundEventResult {
  duplicate: boolean;
}

/**
 * Idempotently record an inbound event id.
 *
 * First delivery marks the id and returns `{ duplicate: false }`; subsequent
 * deliveries of the same id return `{ duplicate: true }` WITHOUT re-running
 * side effects (req 08.5b: idempotent event handling via event-id dedup).
 */
export async function handleInboundEvent(
  eventId: string,
  store: DedupStore,
): Promise<InboundEventResult> {
  if (await store.has(eventId)) {
    return { duplicate: true };
  }
  await store.mark(eventId);
  return { duplicate: false };
}

/** Constant-time string compare to avoid timing oracles. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
