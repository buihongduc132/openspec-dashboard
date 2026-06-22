/**
 * Initiative collection endpoints under a context store (task 5.4, req 01.8).
 *
 * - GET  /api/context-stores/[id]/initiatives            — list initiatives
 * - POST /api/context-stores/[id]/initiatives            — create an initiative
 *
 * Per-initiative edit / delete live under `[initiativeId]/route.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { initiatives, contextStores } from "@/db/schema";
import { eq } from "drizzle-orm";

/** GET — list initiatives for the context store, oldest first. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const all = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.contextStoreId, id))
    .orderBy(initiatives.createdAt);
  return NextResponse.json(all);
}

/**
 * POST — create an initiative.
 *
 * Body: `{ title: string, summary?: string }`. New initiatives always start in
 * the `proposed` status (req 01.8b); transitions happen via PATCH.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Reject early if the parent context store does not exist.
  const [store] = await db.select().from(contextStores).where(eq(contextStores.id, id));
  if (!store) {
    return NextResponse.json({ error: "Context store not found" }, { status: 404 });
  }

  const body = await req.json();
  const title = typeof body?.title === "string" && body.title.trim().length > 0 ? body.title.trim() : null;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const summary =
    typeof body?.summary === "string" && body.summary.trim().length > 0 ? body.summary.trim() : null;

  const [created] = await db
    .insert(initiatives)
    .values({ contextStoreId: id, title, summary })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
