/**
 * Workspace links collection endpoints (task 5.3, req 01.7).
 *
 * A workspace link is the (workspace, project, stable alias, local-path)
 * tuple that connects a registered project to a coordination workspace.
 *
 * - GET   /api/workspaces/[id]/links  — list links for the workspace
 * - POST  /api/workspaces/[id]/links  — add a new link
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
  return NextResponse.json(links);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const linkName = typeof body?.linkName === "string" && body.linkName.trim().length > 0 ? body.linkName.trim() : null;
  const localPath = typeof body?.localPath === "string" && body.localPath.trim().length > 0 ? body.localPath.trim() : null;

  if (!projectId || !linkName || !localPath) {
    return NextResponse.json(
      { error: "projectId, linkName, and localPath are required" },
      { status: 400 },
    );
  }

  // Reject links to a non-existent workspace or project so dangling FKs are
  // surfaced as a 404 / 400 instead of a low-level DB error.
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 400 });
  }

  const [created] = await db
    .insert(workspaceLinks)
    .values({ workspaceId: id, projectId, linkName, localPath })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
