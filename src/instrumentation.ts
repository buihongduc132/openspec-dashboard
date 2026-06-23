/**
 * Task 8.2 - Next.js instrumentation hook.
 *
 * The content-projection spec requires: "On startup the system SHALL sweep
 * stale projections ... and enqueue a background projection for each, without
 * blocking request handling." Next.js invokes the default-exported
 * `register()` function exactly once, when the server runtime initializes
 * (Node.js server, edge runtime, or the dev server), BEFORE any request is
 * served.
 *
 * The sweep is fired-and-forgotten: we kick it off without awaiting it so the
 * startup lifecycle is never blocked by a slow projection, and we attach a
 * `.catch()` so a failing sweep cannot crash the boot. Individual per-project
 * failures are already swallowed inside `sweepStaleProjects`.
 */
import { sweepStaleProjects } from "@/lib/projection/sweep";

/**
 * Next.js instrumentation entry point. Runs once at server startup.
 *
 * Triggers a non-blocking sweep of stale local-project projections. See
 * `sweepStaleProjects` for the selection logic (projected=false OR disk newer
 * than the last run). The returned promise is intentionally NOT awaited by
 * the caller; we attach our own `.catch()` so boot cannot fail on a sweep
 * error.
 */
export async function register(): Promise<void> {
  // Fire-and-forget: never await, never let it reject into the boot path.
  void sweepStaleProjects().catch((err) => {
    console.warn("startup sweep failed:", err);
  });
}
