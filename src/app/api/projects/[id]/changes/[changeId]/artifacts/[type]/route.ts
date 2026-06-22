/**
 * Task 2.16 — Artifact editors (req 03.7/03.8/03.9/03.10).
 *
 *   PATCH /api/projects/{id}/changes/{changeId}/artifacts/{type}
 *
 * Edits the Markdown content of a change's built-in artifact. `type` must be
 * one of the canonical built-ins (proposal/design/tasks/specs). When the
 * artifact row exists, its content is updated; otherwise a new row is
 * inserted (empty-but-present opt-in per req 03.3 AC (c)). Auto-saves update
 * `updatedAt` so the detail view's status recompute is event-driven (03.5).
 */
import { NextRequest } from "next/server";
import { db } from "@/db";
import { artifacts, changes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SUPPORTED_ARTIFACT_TYPES = ["proposal", "design", "tasks", "specs"] as const;
type ArtifactType = (typeof SUPPORTED_ARTIFACT_TYPES)[number];

function isSupportedType(t: string): t is ArtifactType {
  return (SUPPORTED_ARTIFACT_TYPES as readonly string[]).includes(t);
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; changeId: string; type: string }>;
  },
): Promise<Response> {
  const { id, changeId, type } = await params;

  if (!isSupportedType(type)) {
    return Response.json(
      { error: `Unsupported artifact type "${type}". Must be one of ${SUPPORTED_ARTIFACT_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  // Verify the change belongs to this project.
  const [change] = await db
    .select()
    .from(changes)
    .where(and(eq(changes.id, changeId), eq(changes.projectId, id)))
    .limit(1);
  if (!change) {
    return Response.json({ error: "Change not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.content !== "string") {
    return Response.json({ error: "Body must include a string `content` field." }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.changeId, changeId), eq(artifacts.type, type)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(artifacts)
      .set({ content: body.content, updatedAt: new Date() })
      .where(eq(artifacts.id, existing.id))
      .returning();
    return Response.json(updated, { status: 200 });
  }

  const [created] = await db
    .insert(artifacts)
    .values({
      changeId,
      type,
      content: body.content,
      status: "draft",
      outputPath: `openspec/changes/${change.name}/${type}.md`,
    })
    .returning();
  return Response.json(created, { status: 201 });
}
