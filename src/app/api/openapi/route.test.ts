/**
 * Task 1.11 — `GET /api/openapi` self-discovery endpoint (req 08 §8.1a).
 *
 * The dashboard SHALL serve its OpenAPI 3.1 document at a stable URL so that
 * tooling and AI agents can discover the REST surface without reading the
 * source. This test pins the behaviour of the serving route: it returns 200
 * with a JSON body whose `openapi` field is `3.1.0`.
 */
import { describe, it, expect } from "vitest";

describe("GET /api/openapi — self-discovery (task 1.11)", () => {
  it("returns 200 and the OpenAPI 3.1 document", async () => {
    const { GET } = await import("@/app/api/openapi/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("OpenSpec Dashboard REST API");
    expect(body.paths).toHaveProperty("/api/projects");
  });
});
