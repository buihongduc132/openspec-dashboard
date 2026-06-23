/**
 * Task 6.1 — `GET /api/health` (req 08 §8.1 / api-foundation spec).
 *
 * Returns HTTP 200 with a JSON body indicating service liveness and the
 * version of the OpenSpec parser in use:
 *   { status, parserVersion, timestamp, degraded, unhealthyWatchers }
 *
 * `status` is `"ok"` when every registered watcher is healthy, and
 * `"degraded"` (with `degraded: true` and the list of dead watchers) when a
 * filesystem watcher has died — the endpoint stays 200 so load balancers do
 * not drain, but operators are alerted to the unhealthy watcher (spec
 * scenario "Health degrades gracefully on a watcher failure").
 *
 * Note: liveness in Phase 0 does not depend on Postgres (the audit chain +
 * projection are filesystem-backed per D-Audit / D0-2). The DB-backed health
 * probe is exercised by the integration suite; this handler is pure.
 */
import { PARSER_VERSION } from "@/lib/openspec-parser";
import { unhealthyWatchers } from "@/lib/projection/watcher";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const dead = unhealthyWatchers();
  const degraded = dead.length > 0;
  return Response.json({
    status: degraded ? "degraded" : "ok",
    parserVersion: PARSER_VERSION,
    timestamp: new Date().toISOString(),
    degraded,
    unhealthyWatchers: dead,
  });
}
