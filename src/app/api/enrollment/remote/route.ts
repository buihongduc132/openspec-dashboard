import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { checkRemoteCliAuth } from "@/lib/cli-auth";

/**
 * POST /api/enrollment/remote — task 4.3.
 *
 * Stubbed remote-git enrollment. Given a GitHub / GitLab URL the handler:
 *   1. Detects the matching authenticated CLI via `checkRemoteCliAuth`
 *      (`gh` for github.com, `glab` for gitlab.com) — task 4.2.
 *   2. When a CLI is matched and authenticated, registers the project as a
 *      *pending* remote enrollment: `enrollmentSource = "remote-git"`,
 *      `remoteGitUrl` set, `projected = false`. No clone runs in this change
 *      (full wiring lands with git integration, req 08.4).
 *   3. Returns the explicit "planned — full clone lands with git integration"
 *      message alongside the created project.
 *   4. When no CLI matches / is authenticated, responds 409 with the
 *      detection message and does NOT enroll (task 4.4 owns the full
 *      missing-CLI messaging; this handler just refuses to enroll).
 *
 * Request body (JSON): `{ "remoteUrl": "https://github.com/org/repo" }`
 *
 * Success (201): `{ "project": {...}, "message": "..." }`
 * Failure:
 *   400 — missing / empty / non-string URL
 *   409 — no authenticated CLI matched the URL host
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON request body" },
      { status: 400 },
    );
  }

  const raw = (body as Record<string, unknown> | null)?.remoteUrl;
  if (typeof raw !== "string" || raw.trim() === "") {
    return NextResponse.json(
      { error: "remoteUrl is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const remoteUrl = raw.trim();
  const detection = await checkRemoteCliAuth(remoteUrl);

  if (!detection.actionable) {
    // No matching authenticated CLI: do NOT clone, do NOT enroll (task 4.4).
    return NextResponse.json(
      { error: detection.message, detection },
      { status: 409 },
    );
  }

  // Matched + authenticated CLI → record the pending remote enrollment.
  const name = deriveProjectName(remoteUrl);
  const [project] = await db
    .insert(projects)
    .values({
      name,
      rootPath: remoteUrl,
      enrollmentSource: "remote-git",
      remoteGitUrl: remoteUrl,
      projected: false,
    })
    .returning();

  return NextResponse.json(
    {
      project,
      message:
        "Enrolled as a pending remote project — planned; full clone lands with git integration.",
    },
    { status: 201 },
  );
}

/**
 * Derive a human-friendly project name from a remote URL (the repo segment),
 * falling back to the full URL when the segment is empty.
 */
function deriveProjectName(url: string): string {
  const trimmed = url.trim().replace(/[\\/]+$/, "").replace(/\.git$/, "");
  const segs = trimmed.split(/[\\/]/).filter(Boolean);
  const last = segs[segs.length - 1];
  return last && last.length > 0 ? last : trimmed;
}
