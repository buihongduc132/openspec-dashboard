/**
 * Task 1.11 — OpenAPI self-discovery endpoint (req 08 §8.1a).
 *
 * Serves the dashboard's OpenAPI 3.1 document so tooling and AI agents can
 * discover the REST surface from a stable URL. The document is built by the
 * pure `buildOpenApiDocument()` helper so the served spec can never drift
 * from the in-code shape.
 */
import { buildOpenApiDocument } from "@/lib/openapi/document";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(buildOpenApiDocument());
}
