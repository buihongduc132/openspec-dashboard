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
import { projects, specDomains } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  return Response.json(domains);
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
