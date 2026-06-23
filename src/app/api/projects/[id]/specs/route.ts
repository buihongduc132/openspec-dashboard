/**
 * Task 1.11 — `GET /api/projects/{id}/specs` read endpoint (req 08 §8.1, plan §0.5).
 *
 * Returns the spec domains registered for a single project. Read-only
 * Phase-0 skeleton; mirrors the data the existing
 * `/projects/[id]/specs` page already renders. A nonexistent project
 * returns 404 so consumers can rely on the status code rather than guessing
 * from an empty array.
 */
import { NextRequest } from "next/server";
import { db } from "@/db";
import { projects, specDomains, specs } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const domains = await db.select().from(specDomains).where(eq(specDomains.projectId, id));
  // Task 6.3 — surface the projection-populated specs nested under each
  // domain (api-foundation spec: "list spec domains + specs for a project").
  // Reading the projection tables live + force-dynamic (task 6.2) means
  // out-of-band disk edits surface on the next GET without a restart. Filter
  // by this project's domain ids so we never pull another project's specs.
  const domainIds = domains.map((d) => d.id);
  const domainSpecs =
    domainIds.length === 0
      ? []
      : await db.select().from(specs).where(inArray(specs.domainId, domainIds));
  const specsByDomain = new Map<string, typeof domainSpecs>();
  for (const s of domainSpecs) {
    const list = specsByDomain.get(s.domainId) ?? [];
    list.push(s);
    specsByDomain.set(s.domainId, list);
  }
  return Response.json(
    domains.map((d) => ({ ...d, specs: specsByDomain.get(d.id) ?? [] })),
  );
}

/**
 * Task 2.14 — Direct main-spec edits are rejected (req 02 §2.3 AC: "Direct
 * edits to `openspec/specs/*` are rejected by the API"). Main specs mutate
 * only via the propose-via-change flow (`POST .../changes/<id>/delta-specs`).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // The path param is intentionally unused — the rejection is unconditional
  // regardless of which project the caller targets.
  void params;
  return Response.json(
    { error: "Main specs are mutated only via a change. Use the propose-via-change flow." },
    { status: 405 },
  );
}
