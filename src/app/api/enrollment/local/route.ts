import { NextRequest, NextResponse } from "next/server";
import { isPathAllowed } from "@/lib/enrollment";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * POST /api/enrollment/local — task 3.3
 *
 * Validate a candidate directory path against the operator-configured enrollment
 * allow-list and detect whether it is already an OpenSpec project (i.e. it
 * contains `openspec/config.yaml`).
 *
 * The endpoint performs ONLY validation + detection; it does NOT enroll the
 * project (task 3.5) nor run `openspec init` (task 3.4).
 *
 * Request body (JSON):
 *   { "path": "/absolute/or/relative/directory/path" }
 *
 * Success response (200):
 *   { "path": "/absolute/resolved/path", "isOpenSpec": true | false }
 *
 * Failure responses:
 *   400 — missing / empty / non-string path
 *   403 — path is outside the configured enrollment allow-list
 *   404 — path does not exist or is not a directory
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

  const raw = (body as Record<string, unknown> | null)?.path;

  // 1. Reject empty / missing / non-string paths.
  if (typeof raw !== "string" || raw.trim() === "") {
    return NextResponse.json(
      { error: "path is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  // 2. Reject paths outside the allow-list (no filesystem touch here).
  if (!isPathAllowed(raw)) {
    return NextResponse.json(
      { error: "path is outside the allowed enrollment roots" },
      { status: 403 },
    );
  }

  // 3. The path must exist as a directory.
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(raw);
  } catch {
    return NextResponse.json(
      { error: "path does not exist" },
      { status: 404 },
    );
  }
  if (!stat.isDirectory()) {
    return NextResponse.json(
      { error: "path is not a directory" },
      { status: 404 },
    );
  }

  // 4. Detect OpenSpec: presence of `openspec/config.yaml`.
  const resolved = path.resolve(raw);
  const configPath = path.join(resolved, "openspec", "config.yaml");
  let isOpenSpec = false;
  try {
    isOpenSpec = fs.statSync(configPath).isFile();
  } catch {
    // File absent or inaccessible → treat as not an OpenSpec project.
  }

  return NextResponse.json({ path: resolved, isOpenSpec }, { status: 200 });
}
