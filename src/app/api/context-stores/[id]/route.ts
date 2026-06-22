/**
 * Per-context-store endpoints (task 5.4, req 01.8).
 *
 * - GET    /api/context-stores/[id]  — fetch a single context store
 * - PATCH  /api/context-stores/[id]  — update name / path / hasGit
 * - DELETE /api/context-stores/[id]  — delete the store (cascades to initiatives)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contextStores } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [store] = await db.select().from(contextStores).where(eq(contextStores.id, id));
  if (!store) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(store);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(contextStores).where(eq(contextStores.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const set: Partial<typeof contextStores.$inferInsert> = {};
  if (typeof body?.name === "string" && body.name.trim().length > 0) {
    set.name = body.name.trim();
  }
  if (typeof body?.path === "string" && body.path.trim().length > 0) {
    set.path = body.path.trim();
  }
  if (typeof body?.hasGit === "boolean") {
    set.hasGit = body.hasGit;
  }

  const [updated] = await db
    .update(contextStores)
    .set(set)
    .where(eq(contextStores.id, id))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [existing] = await db.select().from(contextStores).where(eq(contextStores.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.delete(contextStores).where(eq(contextStores.id, id));
  return NextResponse.json({ ok: true });
}
