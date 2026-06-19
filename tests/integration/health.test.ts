/**
 * Smoke integration test — hits /api/health against the testcontainer DB.
 * Proves the harness end-to-end: testcontainer → migrations → route handler → response.
 */
import { describe, it, expect } from "vitest";
import "./setup";
import { GET } from "@/app/api/health/route";
import { callGet } from "./helpers";

describe("GET /api/health (integration)", () => {
  it("returns { ok: true } when DB is reachable", async () => {
    const res = await callGet(GET, "/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
