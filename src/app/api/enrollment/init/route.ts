import { NextRequest, NextResponse } from "next/server";
import { isPathAllowed } from "@/lib/enrollment";
import { spawnOpenSpecInit } from "@/lib/openspec-init";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * POST /api/enrollment/init — task 3.4.
 *
 * Runs the OpenSpec CLI's `init` command in a previously-validated candidate
 * directory (the directory the `/api/enrollment/local` endpoint flagged as
 * `isOpenSpec: false`). It runs **only** on explicit user acceptance — this
 * endpoint is invoked by the UI's "Run `openspec init`" action.
 *
 * Behaviour:
 *   - Re-validates the path against the allow-list and confirms it is an
 *     existing directory (defence in depth; the UI also validated).
 *   - Spawns `openspec init` (typed child-process) with `cwd` set to the
 *     chosen directory.
 *   - Streams combined stdout/stderr + the final exit code back to the caller
 *     as a Server-Sent Events (`text/event-stream`) response, so the UI can
 *     render live output.
 *
 * Request body (JSON): `{ "path": "/absolute/or/relative/dir" }`
 *
 * The stream emits one SSE `data:` line per event of the shape
 * `{"type":"stdout"|"stderr"|"exit","data":"..." | code}`.
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

  if (typeof raw !== "string" || raw.trim() === "") {
    return NextResponse.json(
      { error: "path is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (!isPathAllowed(raw)) {
    return NextResponse.json(
      { error: "path is outside the allowed enrollment roots" },
      { status: 403 },
    );
  }

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

  const resolved = path.resolve(raw);
  const { child, events } = spawnOpenSpecInit(resolved);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abortHandler = () => {
        // Kill the child process if the client disconnects to avoid a
        // resource leak (the async iterator would otherwise block on
        // stdout/stderr forever).
        try { child.kill("SIGTERM"); } catch { /* already exited */ }
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", abortHandler, { once: true });

      try {
        for await (const evt of events) {
          const payload =
            evt.type === "exit"
              ? { type: evt.type, code: evt.code }
              : { type: evt.type, data: evt.data };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
      } catch {
        // Client disconnected or stream errored — child already killed by
        // the abort handler if applicable.
      } finally {
        req.signal.removeEventListener("abort", abortHandler);
        try { child.kill("SIGKILL"); } catch { /* already exited */ }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
