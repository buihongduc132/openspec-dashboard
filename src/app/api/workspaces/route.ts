/**
 * Workspaces collection endpoints (task 5.3, req 01.7).
 *
 * Workspaces are multi-repo coordination manifests stored server-side under
 * the dashboard-private root (the `workspaces` / `workspace_links` DB tables),
 * NOT as an invented upstream file. These endpoints cover the create + list
 * write flows; per-workspace edit / delete live under `[id]/route.ts` and the
 * link sub-resource under `[id]/links`.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces } from "@/db/schema";

/** GET /api/workspaces — list all workspaces ordered by name. */
export async function GET() {
  const allWorkspaces = await db.select().from(workspaces).orderBy(workspaces.name);
  return NextResponse.json(allWorkspaces);
}

/**
 * POST /api/workspaces — create a new workspace.
 *
 * Body: `{ name: string, opener?: string | null }`. The `name` is required;
 * `opener` is an optional opener tool alias (e.g. "code", "vim").
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : null;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const opener =
    typeof body?.opener === "string" && body.opener.trim().length > 0 ? body.opener.trim() : null;

  const [created] = await db
    .insert(workspaces)
    .values({ name, opener })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
