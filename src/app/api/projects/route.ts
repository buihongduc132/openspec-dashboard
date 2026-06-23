import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { withProjectionStatus } from "@/lib/projection/status-fields";

/**
 * Task 6.2 — reads MUST reflect out-of-band disk edits without a server
 * restart (api-foundation spec scenario "Reads reflect out-of-band disk
 * edits"). Force dynamic rendering so Next.js never serves a stale,
 * statically-generated project list.
 */
export const dynamic = "force-dynamic";

/**
 * Task 7.3 — list every project with the projection-status envelope
 * (`projected`, `lastProjectedAt`, `parseErrors`) merged onto each row.
 * Remote-git and un-projected projects report `projected=false`,
 * `lastProjectedAt=null`, and an empty `parseErrors` array.
 */
export async function GET() {
  const allProjects = await db.select().from(projects);
  return NextResponse.json(allProjects.map((p) => withProjectionStatus(p)));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [project] = await db
    .insert(projects)
    .values({
      name: body.name,
      description: body.description || null,
      rootPath: body.rootPath,
      defaultSchema: body.defaultSchema || "spec-driven",
      context: body.context || null,
      configYaml: body.configYaml || null,
      // Enrollment metadata (tasks 1.1 / 1.2). Omitted fields fall back to
      // the DB-backed defaults ("local" / null / false) so pre-existing
      // callers keep working.
      enrollmentSource: body.enrollmentSource,
      remoteGitUrl: body.remoteGitUrl ?? null,
      projected: body.projected,
    })
    .returning();
  return NextResponse.json(project, { status: 201 });
}
