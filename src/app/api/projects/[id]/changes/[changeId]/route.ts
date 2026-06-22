/**
 * Task 2.16 — Change metadata edit (req 03.4).
 *
 *   PATCH /api/projects/{id}/changes/{changeId}
 *
 * Edits change metadata (name/description/status/schema). The name, if
 * supplied, must remain canonical kebab-case (req 03.3). Folder rename is
 * the UI's responsibility at the projection layer; this endpoint updates the
 * authoritative metadata row.
 */
import { NextRequest } from "next/server";
import { db } from "@/db";
import { changes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { validateChangeName } from "@/lib/changes";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; changeId: string }> },
): Promise<Response> {
  const { id, changeId } = await params;

  const [existing] = await db
    .select()
    .from(changes)
    .where(and(eq(changes.id, changeId), eq(changes.projectId, id)))
    .limit(1);
  if (!existing) {
    return Response.json({ error: "Change not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name != null) {
    const name = String(body.name).trim();
    if (!validateChangeName(name)) {
      return Response.json(
        { error: "Change name must be kebab-case." },
        { status: 400 },
      );
    }
    patch.name = name;
  }
  if (body.description !== undefined) {
    patch.description = body.description == null ? null : String(body.description);
  }
  if (body.status != null) {
    patch.status = String(body.status);
  }
  if (body.schema != null) {
    patch.schema = String(body.schema);
  }
  // Task 5.5 — Initiatives coordination (req 01.8c): link/unlink a change to
  // an initiative. `initiativeId` may be a UUID string or null (unlink). An
  // empty string is normalized to null.
  if (body.initiativeId !== undefined) {
    const v = body.initiativeId;
    if (v === null || v === "") {
      patch.initiativeId = null;
    } else if (typeof v === "string") {
      // Validate UUID format before hitting the DB (prevents injection /
      // malformed queries).
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(v)) {
        return Response.json(
          { error: "initiativeId must be a valid UUID." },
          { status: 400 },
        );
      }
      patch.initiativeId = v;
    }
    // Non-string / non-null values are ignored (no-op) rather than 400ing,
    // matching the tolerant metadata-edit contract of this endpoint.
  }

  const [updated] = await db
    .update(changes)
    .set(patch)
    .where(eq(changes.id, changeId))
    .returning();

  return Response.json(updated, { status: 200 });
}
