/**
 * Task 7.1 — `POST /api/projects/:id/project` (content-projection spec:
 * "Manual re-project endpoint SHALL be non-blocking").
 *
 * Enqueues a projection job for the project and returns HTTP 202 immediately
 * with `{ jobId, status, projectId }`. The projection itself runs on the queue
 * worker (design D4), never in the request handler, so a large repo projection
 * cannot block the event loop or trip a request timeout.
 *
 * Status codes:
 *  - 404 when the project does not exist;
 *  - 409 when the project is `remote-git` (no projection until git
 *    integration lands);
 *  - 202 with the job descriptor otherwise.
 */
import { NextRequest } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProjectionQueue } from "@/lib/projection/queue-instance";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (project.enrollmentSource === "remote-git") {
    return Response.json(
      {
        error:
          "Remote-git projects are not projected until git integration lands.",
      },
      { status: 409 },
    );
  }

  const result = await getProjectionQueue().enqueue(id);
  return Response.json(result, { status: 202 });
}
