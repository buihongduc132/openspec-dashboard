/**
 * Task 1.11 — `GET /api/projects/{id}/changes` read endpoint (req 08 §8.1, plan §0.5).
 *
 * Returns the changes (proposed/in-flight/archived) registered for a single
 * project. Read-only Phase-0 skeleton. A nonexistent project returns 404 so
 * consumers can rely on the status code rather than guessing from an empty
 * array.
 *
 * Task 2.16 — `POST /api/projects/{id}/changes` change creation (req 03.3):
 * creates a change with a kebab-case, uniqueness-checked name and scaffolds
 * the canonical artifact files (proposal/design/tasks) so the change passes
 * `openspec validate` immediately (AC (a)).
 */
import { NextRequest } from "next/server";
import { db } from "@/db";
import { projects, changes, artifacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  validateChangeName,
  scaffoldChange,
} from "@/lib/changes";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const projectChanges = await db.select().from(changes).where(eq(changes.projectId, id));
  return Response.json(projectChanges);
}

/**
 * Create a new change (req 03.3). Body: `{ name, schema?, description? }`.
 * Returns 404 (no project), 400 (invalid name), 409 (duplicate name), or 201
 * with the created change row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!validateChangeName(name)) {
    return Response.json(
      { error: "Change name must be kebab-case (lowercase letters/digits joined by single dashes)." },
      { status: 400 },
    );
  }

  // Uniqueness check within the project (req 03.3).
  const [existing] = await db
    .select()
    .from(changes)
    .where(and(eq(changes.projectId, id), eq(changes.name, name)))
    .limit(1);
  if (existing) {
    return Response.json({ error: `A change named "${name}" already exists.` }, { status: 409 });
  }

  const schemaName = String(body.schema ?? project.defaultSchema ?? "spec-driven");
  const description = body.description == null ? null : String(body.description);

  const [created] = await db
    .insert(changes)
    .values({
      projectId: id,
      name,
      schema: schemaName,
      status: "proposed",
      description,
    })
    .returning();

  // Scaffold the canonical artifacts so the change validates immediately
  // (req 03.3 AC (a)). Delta specs are created on demand via the
  // propose-via-change flow (task 2.14).
  const files = scaffoldChange({ name, schema: schemaName, description: description ?? undefined });
  const artifactRows = files.map((f) => ({
    changeId: created.id,
    type: f.path.replace(/\.md$/, ""),
    content: f.content,
    status: "draft",
    outputPath: `openspec/changes/${name}/${f.path}`,
  }));
  await db.insert(artifacts).values(artifactRows);

  return Response.json(created, { status: 201 });
}
