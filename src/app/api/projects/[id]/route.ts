import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withProjectionStatus } from "@/lib/projection/status-fields";
import { stopWatch } from "@/lib/projection/watcher";

/**
 * Task 7.3 — detail GET merges the projection-status envelope
 * (`projected`, `lastProjectedAt`, `parseErrors`) onto the project row.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(withProjectionStatus(project));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const [updated] = await db
    .update(projects)
    .set({
      name: body.name,
      description: body.description ?? null,
      rootPath: body.rootPath,
      defaultSchema: body.defaultSchema,
      context: body.context ?? null,
      configYaml: body.configYaml ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deleted] = await db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning();
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await stopWatch(id);
  return new NextResponse(null, { status: 204 });
}
