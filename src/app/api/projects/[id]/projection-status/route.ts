/**
 * Task 7.2 — `GET /api/projects/:id/projection-status` (projection-status
 * spec: "A dedicated status endpoint SHALL return detailed projection state").
 *
 * Returns a JSON object with:
 *  - `projectId` — the path id;
 *  - `projected` — boolean from the project row;
 *  - `lastProjectedAt` — ISO 8601 string or null;
 *  - `currentJob` — the live queue job snapshot for this project, or null when
 *    no job is in-flight;
 *  - `parseErrors` — the array of parse-issue objects persisted on the project
 *    row (derived from `projectionError` JSON, or an empty array).
 *
 * Status codes:
 *  - 404 when the project does not exist;
 *  - 200 otherwise, including for remote-git projects (projected=false,
 *    currentJob=null).
 */
import { NextRequest } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProjectionQueue } from "@/lib/projection/queue-instance";
import { deriveParseErrors } from "@/lib/projection/status-fields";

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

  const job = getProjectionQueue().getStatus(id);
  // `idle` jobs are NOT "in-flight" — only queued/running/failed surface a
  // currentJob to the UI. The projection-status spec describes currentJob as
  // the live job; once idle it is reported as null.
  const currentJob =
    job && (job.status === "queued" || job.status === "running" || job.status === "failed")
      ? {
          jobId: job.jobId,
          status: job.status,
          ...(job.startedAt ? { startedAt: job.startedAt.toISOString() } : {}),
        }
      : null;

  return Response.json({
    projectId: id,
    projected: project.projected,
    lastProjectedAt: project.lastProjectedAt
      ? project.lastProjectedAt.toISOString()
      : null,
    currentJob,
    parseErrors: deriveParseErrors(project.projectionError),
  });
}
