import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";

export async function GET() {
  const allProjects = await db.select().from(projects);
  return NextResponse.json(allProjects);
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
