/**
 * Per-workspace endpoints (task 5.3, req 01.7).
 *
 * - GET    /api/workspaces/[id]  — fetch a single workspace (with its links)
 * - PATCH  /api/workspaces/[id]  — update name / opener
 * - DELETE /api/workspaces/[id]  — delete the workspace (cascades to links)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceLinks, projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const links = await db
    .select({
      id: workspaceLinks.id,
      workspaceId: workspaceLinks.workspaceId,
      projectId: workspaceLinks.projectId,
      linkName: workspaceLinks.linkName,
      localPath: workspaceLinks.localPath,
      projectName: projects.name,
    })
    .from(workspaceLinks)
    .innerJoin(projects, eq(projects.id, workspaceLinks.projectId))
    .where(eq(workspaceLinks.workspaceId, id));
  return NextResponse.json({ ...workspace, links });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const set: Partial<typeof workspaces.$inferInsert> = { updatedAt: new Date() };
  if (typeof body?.name === "string" && body.name.trim().length > 0) {
    set.name = body.name.trim();
  }
  if (body?.opener === null || body?.opener === undefined) {
    // keep existing opener if not provided
  } else if (typeof body?.opener === "string") {
    set.opener = body.opener.trim().length > 0 ? body.opener.trim() : null;
  }

  const [updated] = await db
    .update(workspaces)
    .set(set)
    .where(eq(workspaces.id, id))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.delete(workspaces).where(eq(workspaces.id, id));
  return NextResponse.json({ ok: true });
}
