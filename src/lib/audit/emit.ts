/**
 * Task 5.11 (GREEN) — Audit-emission middleware + stub mutation route
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Audit-emission contract on mutating endpoints (NFR-10)").
 *
 * The emission contract: every mutating endpoint SHALL emit an audit record.
 * This module provides:
 *
 *   1. {@link withAuditEmission} — framework-free middleware that wraps a
 *      handler. On every successful mutation response (2xx), the middleware
 *      appends an audit entry via the injected {@link AuditAppendQueue}.
 *   2. An {@link AuditEmitResolver} that each route implements to extract the
 *      `EntryBody` fields from the request + response. This keeps the
 *      middleware generic (mirrors {@link withEtag} / {@link withQuarantineGate}).
 *
 * Why a middleware + resolver (vs. a per-route manual `queue.append`): the
 * contract test (NFR-10) asserts that EVERY mutating endpoint emits. Without
 * a single wrapper, the only way to prove the contract is to inspect every
 * route by hand — fragile and exactly the gap NFR-10 exists to close. The
 * middleware is the one place where emission is guaranteed; forgetting to
 * wrap a route is a visible omission caught by the contract test.
 *
 * The stub mutation route (`POST /api/__stub/mutate`) exists ONLY to prove
 * the middleware + emission contract end-to-end at the Phase 0 boundary. It
 * goes through ETag + audit emission; the contract test targets it. It is
 * REMOVED at the Phase 1 boundary (Phase 1 wires real mutating endpoints).
 */
import type { EntryBody } from "./chain";
import type { AuditAppendQueue } from "./append-queue";

/**
 * Per-route resolver: given the request (and optionally the handler's
 * response), return the {@link EntryBody} that the audit-emission middleware
 * should append. Lives outside the middleware so each route encodes its own
 * actor/action/entity/beforeHash/afterHash mapping.
 *
 * The resolver runs AFTER the handler so it can observe the response (e.g.
 * the new artifact hash in the body) to populate `afterHash`.
 */
export type AuditEmitResolver = (
  request: Request,
  response: Response,
  body: unknown,
) => EntryBody;

/** Dependencies injected into {@link withAuditEmission}. */
export interface WithAuditEmissionDeps {
  /** Per-project audit append queue (the filesystem chain's writer). */
  queue: AuditAppendQueue;
  /**
   * Resolves the projectId this mutation targets. Mirrors the per-route
   * {@link SectionResolver}'s file-key extraction.
   */
  projectIdResolver: (request: Request, body: unknown) => string;
  /** Route-specific audit body resolver (see {@link AuditEmitResolver}). */
  resolver: AuditEmitResolver;
}

/**
 * Wrap a handler with audit-emission.
 *
 * Contract:
 *   - Non-mutating methods (GET/HEAD/OPTIONS) bypass emission entirely
 *     (reads are not audited; only mutations are).
 *   - Mutating methods: the handler runs FIRST. On a successful response
 *     (status < 400), the resolver is invoked and the resulting {@link EntryBody}
 *     is appended to `projectId`'s audit chain. The emission failure
 *     surfaces as an X-Audit-Emission header (`failed`) but does NOT roll
 *     back the mutation (the chain is authoritative; a single append failure
 *     is a logged incident, not a reverted transaction).
 *   - On a handler failure (status >= 400), emission is SKIPPED (no mutation
 *     actually occurred from the chain's perspective).
 *
 * Why "append failure does not rollback": the filesystem chain is authoritative
 * (D0-3); rolling back the mutation because the chain append failed would
 * invert the spec ("filesystem chain is truth") into "chain availability gates
 * mutation availability". That is D0-3's explicit non-goal. A failed append
 * is surfaced as a header + logged; the operator incident is the recovery
 * layer's concern.
 */
export function withAuditEmission(
  handler: (request: Request) => Promise<Response>,
  deps: WithAuditEmissionDeps,
): (request: Request) => Promise<Response> {
  const { queue, projectIdResolver, resolver } = deps;

  return async (request: Request): Promise<Response> => {
    const method = request.method.toUpperCase();

    // Read-passthrough: audit emission gates mutations only.
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return handler(request);
    }

    // Parse the body once so the resolver + projectId resolver both see it.
    // We re-clone the request for the downstream handler so it can still
    // read the body if it needs to.
    let body: unknown = undefined;
    if (request.body !== null) {
      try {
        body = await request.clone().json();
      } catch {
        body = undefined;
      }
    }

    const response = await handler(request);
    const status = response.status;

    // Emission is skipped on handler failures (no mutation from the chain's
    // perspective). Surface the fact via a header so a missing emission on a
    // 2xx can be detected independently.
    if (status >= 400) {
      const headers = new Headers(response.headers);
      headers.set("x-audit-emission", "skipped:handler-failure");
      return new Response(response.body, {
        status,
        statusText: response.statusText,
        headers,
      });
    }

    // Successful mutation: emit an audit record via the chain's writer.
    try {
      const projectId = projectIdResolver(request, body);
      const entryBody = resolver(request, response, body);
      await queue.append(projectId, entryBody);
      const headers = new Headers(response.headers);
      headers.set("x-audit-emission", "emitted");
      return new Response(response.body, {
        status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      // Append failure is surfaced but NOT fatal (per the contract above).
      const headers = new Headers(response.headers);
      headers.set("x-audit-emission", "failed");
      return new Response(response.body, {
        status,
        statusText: response.statusText,
        headers,
      });
    }
  };
}
