/**
 * Task 5.8 (GREEN) — Read-only quarantine state + mutation gating middleware
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Read-only quarantine on chain break").
 *
 * On a detected chain break the server enters read-only quarantine: mutating
 * endpoints return 503 with a quarantine reason; read endpoints keep serving.
 * An operator clears the quarantine to resume mutations.
 *
 * Design notes:
 *   - The quarantine is deployment-wide (a single broken chain is treated as
 *     an operator incident; the spec says "the server SHALL enter read-only
 *     quarantine"). The reason records WHICH project broke so the operator
 *     knows what to repair.
 *   - The middleware is framework-free over Web `Request`/`Response`, mirroring
 *     `@/app/api/middleware/etag.ts`. It wraps a handler; mutating methods are
 *     gated, everything else passes through to the handler unchanged.
 *   - The state is injectable so the verifier job (task 5.6) and tests can
 *     drive a fresh in-memory instance.
 */
import type { VerificationFinding } from "./verifier";

/** Why the server is quarantined (which project broke + its findings). */
export interface QuarantineReason {
  /** Project whose audit chain failed verification. */
  projectId: string;
  /** Findings reported by the verifier for that project. */
  findings: VerificationFinding[];
}

/** Snapshot of the current quarantine state (for operators / health). */
export interface QuarantineStatus {
  active: boolean;
  reason?: QuarantineReason;
}

/** Injectable quarantine state. */
export interface QuarantineState {
  /** Enter read-only quarantine because `reason`'s chain broke. Idempotent. */
  enter(reason: QuarantineReason): void;
  /** Operator-driven clear: mutations resume immediately. */
  clear(): void;
  /** True while the server should gate mutations. */
  active(): boolean;
  /** Snapshot for health/operator surfaces. */
  status(): QuarantineStatus;
}

/** Methods that mutate state and are therefore gated during quarantine. */
const MUTATING_METHODS = new Set(["PUT", "POST", "PATCH", "DELETE"]);

/**
 * Build a fresh in-memory quarantine state. The verifier scheduled job calls
 * `enter()` on a break; an operator (or recovery layer) calls `clear()`.
 */
export function createQuarantineState(): QuarantineState {
  let reason: QuarantineReason | undefined;
  return {
    enter(r) {
      // Idempotent: first break wins so the reason reflects the original
      // incident until an operator clears it. Subsequent breaks during the
      // same incident don't overwrite the recorded root cause.
      if (reason === undefined) {
        reason = r;
      }
    },
    clear() {
      reason = undefined;
    },
    active() {
      return reason !== undefined;
    },
    status() {
      return reason === undefined
        ? { active: false }
        : { active: true, reason };
    },
  };
}

/**
 * Wrap a handler with quarantine mutation gating.
 *
 *   - Mutating methods (PUT/POST/PATCH/DELETE) → 503 `quarantine` while the
 *     state is active; the body names the broken project + findings.
 *   - Everything else (GET/HEAD/OPTIONS) → handler runs unchanged (reads stay
 *     available during quarantine).
 */
export function withQuarantineGate(
  handler: (request: Request) => Promise<Response>,
  state: QuarantineState,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (state.active() && MUTATING_METHODS.has(request.method.toUpperCase())) {
      const { reason } = state.status();
      return new Response(
        JSON.stringify({
          error: "quarantine",
          quarantine: true,
          message:
            "Server is in read-only quarantine due to an audit-chain break. Mutations are refused until an operator clears the quarantine.",
          reason,
        }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return handler(request);
  };
}
