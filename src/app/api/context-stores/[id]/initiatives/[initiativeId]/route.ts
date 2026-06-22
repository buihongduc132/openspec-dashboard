/**
 * Per-initiative endpoints under a context store (task 5.4, req 01.8b/c).
 *
 * - GET    /api/context-stores/[id]/initiatives/[initiativeId]
 *          — unified cross-repo view: the initiative plus every change linked
 *            to it across all repos, each labeled with its source project name
 *            (task 5.5, req 01.8c).
 * - PATCH  /api/context-stores/[id]/initiatives/[initiativeId]
 *          — update title/summary and transition status (validated)
 * - DELETE /api/context-stores/[id]/initiatives/[initiativeId]
 *          — remove the initiative
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { initiatives, changes, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canTransition, isValidStatus } from "@/lib/initiatives/status";

export const dynamic = "force-dynamic";

/**
 * GET — unified cross-repo initiative view (task 5.5, req 01.8c).
 *
 * Returns `{ initiative, linkedChanges }`. `linkedChanges` lists every change
 * row whose `initiativeId` matches, joined to its owning project so each entry
 * carries the source-repo label (`projectName`). An initiative with no links
 * returns `linkedChanges: []` (the empty state).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; initiativeId: string }> },
) {
  const { initiativeId } = await params;

  const [initiative] = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId));
  if (!initiative) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const linked = await db
    .select({
      id: changes.id,
      name: changes.name,
      status: changes.status,
      schema: changes.schema,
      description: changes.description,
      projectId: changes.projectId,
      // Source-repo label (req 01.8c): each change is labeled with the project
      // (repo) it originates from so the unified view can disambiguate
      // same-named changes across repos.
      projectName: projects.name,
      createdAt: changes.createdAt,
      updatedAt: changes.updatedAt,
    })
    .from(changes)
    .innerJoin(projects, eq(projects.id, changes.projectId))
    .where(eq(changes.initiativeId, initiativeId))
    .orderBy(changes.createdAt);

  return NextResponse.json({ initiative, linkedChanges: linked });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; initiativeId: string }> },
) {
  const { initiativeId } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(initiatives).where(eq(initiatives.id, initiativeId));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const set: Partial<typeof initiatives.$inferInsert> = {};

  if (typeof body?.title === "string" && body.title.trim().length > 0) {
    set.title = body.title.trim();
  }
  if (typeof body?.summary === "string") {
    set.summary = body.summary.trim().length > 0 ? body.summary.trim() : null;
  }
  if (typeof body?.status === "string") {
    if (!isValidStatus(body.status)) {
      return NextResponse.json(
        { error: `invalid status '${body.status}'` },
        { status: 400 },
      );
    }
    if (!canTransition(existing.status, body.status)) {
      return NextResponse.json(
        { error: `invalid transition '${existing.status}' -> '${body.status}'` },
        { status: 400 },
      );
    }
    set.status = body.status;
  }

  const [updated] = await db
    .update(initiatives)
    .set(set)
    .where(eq(initiatives.id, initiativeId))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; initiativeId: string }> },
) {
  const { initiativeId } = await params;
  const [existing] = await db.select().from(initiatives).where(eq(initiatives.id, initiativeId));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.delete(initiatives).where(eq(initiatives.id, initiativeId));
  return NextResponse.json({ ok: true });
}
