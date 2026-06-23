/**
 * Task 5.11 (GREEN) — Phase-1-stand-in stub mutation route
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Audit-emission contract on mutating endpoints (NFR-10)"; design D0-7).
 *
 *   POST /api/__stub/mutate
 *
 * Phase 0 has NO real feature mutating endpoints yet, so this stand-in proves
 * the middleware + emission contract end-to-end BEFORE Phase 1 wires real
 * routes. The route goes through, in order:
 *
 *   1. {@link withQuarantineGate} — 503 while the deployment is in read-only
 *      quarantine (audit-chain break / unreadable audit file).
 *   2. {@link withEtag} — section-scoped optimistic concurrency (INV-7):
 *      missing If-Match → 428; stale If-Match → 409; fresh → bump + ETag.
 *   3. {@link withAuditEmission} — appends an audit record to the filesystem
 *      chain on every successful mutation (NFR-10).
 *
 * The route is REMOVED at the Phase 1 boundary (Phase 1 wires real mutating
 * endpoints; the contract test then targets those). The `__stub` namespace
 * makes removal greppable; the testing-standard knip gate flags leftovers.
 *
 * **Request body:** `{ projectId?, actor?, entity?, payload? }`. The stub
 * echoes the payload back so clients can verify round-trip; `projectId`
 * defaults to `"stub"`.
 */
import { NextResponse } from "next/server";
import { withEtag } from "@/app/api/middleware/etag";
import { withQuarantineGate } from "@/lib/audit/quarantine";
import { withAuditEmission } from "@/lib/audit/emit";
import {
  getStubMutateRuntime,
  newRequestId,
} from "@/lib/audit/server-runtime";

/** Stub section identity (single fixed section for the stand-in route). */
const STUB_FILE_KEY = "__stub/mutate";
const STUB_SECTION_KEY = "stub";

/** Stub request body shape. */
interface StubBody {
  projectId?: string;
  actor?: string;
  entity?: string;
  payload?: unknown;
}

/**
 * Phase-1-stand-in mutating endpoint. Wrapped (outermost → innermost) by
 * quarantine gate → ETag → audit emission so the NFR-10 contract test proves
 * all three compose for a real mutating request.
 */
export const POST = handleStubMutate;

/** Testable handler (exported so the contract test can invoke it directly). */
export async function handleStubMutate(request: Request): Promise<Response> {
  const rt = getStubMutateRuntime();

  // Innermost: the actual mutation + audit emission.
  const withEmission = withAuditEmission(
    async (req) => {
      const body = await readBody(req);
      return NextResponse.json({
        ok: true,
        stub: true,
        projectId: body.projectId ?? "stub",
        payload: body.payload ?? null,
      });
    },
    {
      queue: rt.queue,
      projectIdResolver: (_req, body) => projectIdFromBody(body),
      resolver: (_req, _response, body) => ({
        actor: actorFromBody(body),
        action: "stub.mutate",
        entity: entityFromBody(body),
        beforeHash: "0".repeat(8),
        afterHash: "f".repeat(8),
        timestamp: Date.now(),
        requestId: newRequestId(),
      }),
    },
  );

  // Middle: section-scoped optimistic concurrency (INV-7).
  const withEtagWrapper = withEtag(withEmission, stubSectionResolver, {
    store: rt.store,
  });

  // Outermost: read-only quarantine gate (audit-chain break).
  const gated = withQuarantineGate(withEtagWrapper, rt.quarantine);
  return gated(request);
}

/** Section resolver for the stub route (single fixed section). */
function stubSectionResolver(_request: Request, body: unknown) {
  return {
    fileKey: STUB_FILE_KEY,
    sectionKey: STUB_SECTION_KEY,
    sectionBytes: JSON.stringify(body ?? {}),
  };
}

/** Read + coerce the request body to the stub shape. */
async function readBody(req: Request): Promise<StubBody> {
  try {
    const parsed = (await req.clone().json()) as Partial<StubBody>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function projectIdFromBody(body: unknown): string {
  return typeof body === "object" && body !== null && "projectId" in body
    ? String((body as StubBody).projectId ?? "stub")
    : "stub";
}

function actorFromBody(body: unknown): string {
  return typeof body === "object" && body !== null && "actor" in body
    ? String((body as StubBody).actor ?? "stub-actor")
    : "stub-actor";
}

function entityFromBody(body: unknown): string {
  return typeof body === "object" && body !== null && "entity" in body
    ? String((body as StubBody).entity ?? "stub:entity")
    : "stub:entity";
}
