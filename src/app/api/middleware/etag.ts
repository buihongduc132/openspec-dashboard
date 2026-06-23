/**
 * Task 4.8 (GREEN) — per-section ETag HTTP middleware (INV-7), design D0-4.
 *
 * One generic {@link withEtag} wrapper envelopes every mutating route. The
 * per-route {@link SectionResolver} returns `{ fileKey, sectionKey,
 * sectionBytes }` for the route per the Section Granularity Table. The
 * middleware computes/validates the ETag, checks `If-Match`, and on success
 * bumps `monotonicVersion` (via the in-memory {@link SectionEtagStore}) and
 * returns the new ETag on the response.
 *
 * Behaviour (filesystem-projection spec "Per-section ETag concurrency
 * (INV-7)"):
 *  - Different sections of the same file both succeed (independent versions).
 *  - Same-section second commit returns 409 + current ETag + merge-UI pointer.
 *  - Missing If-Match on a mutation (PUT/PATCH/DELETE) returns 428 BEFORE the
 *    handler runs.
 *  - POST create of an untracked section is exempt from If-Match.
 *
 * The store is injected so tests drive a fresh in-memory store; production
 * wires the per-project persisted store (task 4.10).
 *
 * This module is framework-agnostic over the `Request`/`Response` Web
 * primitives (Next.js App Router route handlers pass these through unchanged),
 * so it is unit-testable without spinning up the Next server.
 */
import type { SectionEtagStore } from "@/lib/section-etag";

/** Resolved section identity + bytes for one mutating request. */
export interface ResolvedSection {
  /** File key under which this section lives (e.g. `tasks.md`). */
  fileKey: string;
  /** Section key within the file (e.g. `line:5`, a heading slug). */
  sectionKey: string;
  /** The NEW section bytes the client is committing (post-mutation). */
  sectionBytes: string;
}

/**
 * Per-route resolver: given the request and its parsed JSON body, return the
 * section this mutation targets. Lives outside the middleware so each route
 * encodes the Section Granularity Table entry for its artifact type.
 */
export type SectionResolver = (request: Request, body: unknown) => ResolvedSection;

/** Dependencies injected into {@link withEtag}. */
export interface WithEtagDeps {
  /** Per-project section ETag store (the INV-7 source of truth). */
  store: SectionEtagStore;
}

/** Methods that mutate state and therefore require optimistic-concurrency. */
const MUTATING_METHODS = new Set(["PUT", "PATCH", "DELETE", "POST"]);

/** Build a JSON Response with a given status + body. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Wrap a mutating route handler with section-scoped optimistic concurrency.
 *
 * Flow:
 *  1. Non-mutating methods (GET, HEAD, OPTIONS) bypass the middleware and go
 *     straight to the handler.
 *  2. The body is parsed as JSON and handed to `sectionResolver`.
 *  3. If the section is untracked AND the method is POST → CREATE: exempt from
 *     If-Match; accept, bump version, run handler, return new ETag.
 *  4. Otherwise the mutation requires If-Match:
 *     - missing If-Match → 428 (handler NOT invoked).
 *     - If-Match does not match the current ETag → 409 + current ETag + merge
 *       pointer (handler NOT invoked).
 *     - match → run handler, return its response with the new ETag attached.
 *
 * The version bump happens via {@link SectionEtagStore.commit} immediately
 * before the handler runs (in-memory synchronous, no inter-request race
 * window within one event-loop turn). Persistence of the new bytes is the
 * handler's responsibility (via the atomic-write layer); the ETag version
 * reflects the accepted intent.
 */
export function withEtag(
  handler: (request: Request) => Promise<Response>,
  sectionResolver: SectionResolver,
  deps: WithEtagDeps,
): (request: Request) => Promise<Response> {
  const { store } = deps;

  return async (request: Request): Promise<Response> => {
    const method = request.method.toUpperCase();

    // Read-passthrough: ETags gate mutations only.
    if (!MUTATING_METHODS.has(method)) {
      return handler(request);
    }

    // Parse the body once so the resolver sees structured input. Clone so the
    // handler can still read the body if it needs to.
    let body: unknown = undefined;
    if (request.body !== null) {
      try {
        body = await request.clone().json();
      } catch {
        // Non-JSON or empty body: leave undefined; the resolver decides.
        body = undefined;
      }
    }

    const { fileKey, sectionKey, sectionBytes } = sectionResolver(request, body);
    const ifMatch = request.headers.get("if-match") ?? undefined;
    const tracked = store.get(fileKey, sectionKey) !== undefined;

    // CREATE exemption: POST to a brand-new (untracked) section needs no
    // If-Match (the section has no prior ETag to match).
    const isCreate = method === "POST" && !tracked;
    if (isCreate) {
      const result = store.commit(fileKey, sectionKey, sectionBytes, undefined);
      if (!result.ok) {
        // Should not happen for an untracked create, but stay defensive.
        return json(409, {
          error: "conflict",
          etag: result.etag,
          mergeUi: mergeUiPath(fileKey, sectionKey),
        });
      }
      const response = await handler(request);
      return withEtagHeader(response, result.etag);
    }

    // UPDATE: a tracked (or non-POST untracked) mutation requires If-Match.
    if (ifMatch === undefined) {
      return json(428, {
        error: "precondition_required",
        message: "If-Match header is required for this mutating request.",
      });
    }

    const result = store.commit(fileKey, sectionKey, sectionBytes, ifMatch);
    if (!result.ok) {
      return json(409, {
        error: "conflict",
        etag: result.etag,
        mergeUi: mergeUiPath(fileKey, sectionKey),
      });
    }

    const response = await handler(request);
    return withEtagHeader(response, result.etag);
  };
}

/** Attach the freshly-computed ETag to the handler's response. */
function withEtagHeader(response: Response, etag: string): Response {
  const headers = new Headers(response.headers);
  headers.set("etag", etag);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Phase-0 merge-UI pointer. Phase 1.3 ships the actual merge UI; until then
 * we surface only the canonical pointer so clients can detect/redirect.
 */
function mergeUiPath(fileKey: string, sectionKey: string): string {
  const file = encodeURIComponent(fileKey);
  const section = encodeURIComponent(sectionKey);
  return `/merge?file=${file}&section=${section}`;
}
