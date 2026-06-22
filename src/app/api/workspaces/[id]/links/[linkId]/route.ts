/**
 * Workspace link delete endpoint (task 5.3, req 01.7).
 *
 * DELETE /api/workspaces/[id]/links/[linkId] — remove a single link from the
 * workspace. Per-link path resolution checks (req 01.7 (b)/(c)) live in the
 * workspace doctor flow; deletion simply detaches the alias.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceLinks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await params;
  const [existing] = await db
    .select()
    .from(workspaceLinks)
    .where(eq(workspaceLinks.id, linkId));
  if (!existing || existing.workspaceId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.delete(workspaceLinks).where(eq(workspaceLinks.id, linkId));
  return NextResponse.json({ ok: true });
}
