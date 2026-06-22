/**
 * Per-initiative endpoints under a context store (task 5.4, req 01.8b).
 *
 * - PATCH  /api/context-stores/[id]/initiatives/[initiativeId]
 *           — update title/summary and transition status (validated)
 * - DELETE /api/context-stores/[id]/initiatives/[initiativeId]
 *           — remove the initiative
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canTransition, isValidStatus } from "@/lib/initiatives/status";

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
