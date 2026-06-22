/**
 * Task 6.3 — Outbound webhook dispatch (req 08.5a).
 *
 * Spec source: req 08 §8.5 (a) in
 * `flow/requirements/08-integration-sync.md`.
 *
 * Contract:
 *   - Payload is HMAC-SHA256 signed with a shared secret and emitted via a
 *     versioned signature header `v=<n>,sig=<hex>` (supports rotation, req
 *     08.5b). The signature is computed over the EXACT UTF-8 bytes of the
 *     body so the receiver can recompute byte-for-byte.
 *   - Delivery retries with exponential backoff up to `maxAttempts`; a
 *     delivery that eventually 2xxs resolves `{ status: "delivered" }`.
 *   - Exhausted retries resolve `{ status: "dead_lettered", attempts,
 *     lastStatus }` — the caller persists these into a dead-letter queue.
 *   - Delivery to a host not on the SSRF egress allowlist is refused BEFORE
 *     any network attempt (`{ status: "blocked", reason: "ssrf" }`).
 *
 * This module contains NO network I/O of its own — the HTTP transport is
 * injectable (matching D-MPCD-5) so the dispatch policy is fully unit-
 * testable without a real fetch.
 */
import { createHmac } from "node:crypto";
import { isEgressAllowed, type EgressAllowlist } from "./ssrf";

/** Canonical signature header name (versioned scheme). */
export const SIGNATURE_HEADER = "X-OpenSpec-Signature";

/** A configured outbound webhook endpoint. */
export interface OutboundWebhook {
  /** Absolute delivery URL. */
  url: string;
  /** Shared HMAC secret. */
  secret: string;
  /** Signature version (incremented on rotation). */
  version: number;
}

/** Injectable HTTP transport: returns whether the delivery succeeded. */
export type DispatchTransport = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number }>;

/** Injectable sleep (exponential backoff between retries). */
export type SleepFn = (ms: number) => Promise<void>;

/** Result of a {@link dispatchOutbound} attempt. */
export type DispatchResult =
  | { status: "delivered"; attempts: number }
  | { status: "dead_lettered"; attempts: number; lastStatus: number }
  | { status: "blocked"; reason: "ssrf" };

/** Options for {@link dispatchOutbound}. */
export interface DispatchOptions {
  /** Injectable transport (tests pass a fake; prod omits this). */
  transport?: DispatchTransport;
  /** Maximum delivery attempts (default 4). */
  maxAttempts?: number;
  /** Base backoff in ms (default 500). Actual delay = base * 2^(attempt-1). */
  backoffMs?: number;
  /** Injectable sleep (tests pass a no-op; prod omits this). */
  sleep?: SleepFn;
}

/**
 * Compute the HMAC-SHA256 hex digest of `body` under `secret`.
 *
 * The digest is over the exact UTF-8 bytes of `body`; the receiver MUST
 * recompute over the same bytes to verify.
 */
export function signPayload(
  body: string,
  secret: string,
  _version: number,
): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Build the versioned signature header: `v=<version>,sig=<hex>`.
 *
 * The version prefix lets the receiver pick the matching active secret
 * during a rotation window (req 08.5b).
 */
export function buildSignatureHeader(
  body: string,
  secret: string,
  version: number,
): string {
  return `v=${version},sig=${signPayload(body, secret, version)}`;
}

/**
 * Dispatch an outbound webhook with HMAC signing, SSRF gating, and retry
 * with exponential backoff.
 */
export async function dispatchOutbound(
  hook: OutboundWebhook,
  body: string,
  allowlist: EgressAllowlist,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  // 1) SSRF gate FIRST — never start a network attempt to a non-allowlisted host.
  if (!isEgressAllowed(hook.url, allowlist)) {
    return { status: "blocked", reason: "ssrf" };
  }

  if (!opts.transport) {
    throw new Error("dispatchOutbound: a transport function is required");
  }
  const transport = opts.transport;
  const maxAttempts = opts.maxAttempts ?? 4;
  const base = opts.backoffMs ?? 500;
  const sleep: SleepFn = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const headers = {
    "Content-Type": "application/json",
    [SIGNATURE_HEADER]: buildSignatureHeader(body, hook.secret, hook.version),
  };

  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await transport(hook.url, body, headers);
    lastStatus = res.status;
    if (res.ok && res.status >= 200 && res.status < 300) {
      return { status: "delivered", attempts: attempt };
    }
    if (attempt < maxAttempts) {
      await sleep(base * 2 ** (attempt - 1));
    }
  }
  return { status: "dead_lettered", attempts: maxAttempts, lastStatus };
}
