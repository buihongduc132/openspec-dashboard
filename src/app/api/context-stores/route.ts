/**
 * Context stores collection endpoints (task 5.4, req 01.8).
 *
 * Context stores are server-side projection metadata (the `context_stores` DB
 * table) — NOT an invented upstream file. CLI parity is deferred until the
 * upstream context-store format is confirmed. These endpoints cover the
 * create + list write flows; per-store edit / delete live under `[id]/route.ts`
 * and the initiative sub-resource under `[id]/initiatives`.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contextStores } from "@/db/schema";

/** GET /api/context-stores — list all context stores ordered by name. */
export async function GET() {
  const allStores = await db.select().from(contextStores).orderBy(contextStores.name);
  return NextResponse.json(allStores);
}

/**
 * POST /api/context-stores — create a new context store.
 *
 * Body: `{ name: string, path: string, hasGit?: boolean }`. `name` and `path`
 * are required; `hasGit` defaults to false.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : null;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const path = typeof body?.path === "string" && body.path.trim().length > 0 ? body.path.trim() : null;
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  const hasGit = typeof body?.hasGit === "boolean" ? body.hasGit : false;

  const [created] = await db
    .insert(contextStores)
    .values({ name, path, hasGit })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
