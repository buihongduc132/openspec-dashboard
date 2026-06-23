/**
 * Task 6.1 — `GET /api/health` (req 08 §8.1 / api-foundation spec).
 *
 * The health endpoint SHALL return HTTP 200 with a JSON body indicating
 * service liveness AND the version of the OpenSpec parser in use:
 *   { status: "ok", parserVersion, timestamp }
 * When a registered project's filesystem watcher has died, the endpoint SHALL
 * still return 200 but include a `degraded` indicator listing the unhealthy
 * watcher(s) rather than reporting fully ok.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  unhealthy: [] as string[],
}));

vi.mock("@/lib/projection/watcher", () => ({
  unhealthyWatchers: () => state.unhealthy,
}));

describe("GET /api/health (task 6.1)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.unhealthy = [];
  });

  it("returns 200 with status, parserVersion, and timestamp when healthy", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.parserVersion).toBe("string");
    expect(body.parserVersion.length).toBeGreaterThan(0);
    expect(typeof body.timestamp).toBe("string");
    // ISO-8601 parseable.
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(body.degraded).toBeFalsy();
  });

  it("includes a degraded indicator listing unhealthy watchers when a watcher has died", async () => {
    state.unhealthy = ["proj-dead"];
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.degraded).toEqual(true);
    expect(Array.isArray(body.unhealthyWatchers)).toBe(true);
    expect(body.unhealthyWatchers).toContain("proj-dead");
    // parserVersion + timestamp still present even when degraded.
    expect(typeof body.parserVersion).toBe("string");
    expect(typeof body.timestamp).toBe("string");
  });
});
