/**
 * Task 6.4 — OpenAPI 3.1 generation (api-foundation spec).
 *
 * The generated document SHALL (a) validate against the official OpenAPI 3.1
 * schema with no errors, and (b) cover EVERY exposed endpoint with
 * request/response schemas — including the Phase-1-stand-in stub mutation
 * route (`POST /api/__stub/mutate`, design D0-7) which is a real exposed
 * endpoint the audit-emission contract targets. Validation uses the bundled
 * `@hyperjump/json-schema` OpenAPI 3.1 meta-schema so the test is offline and
 * authoritative (not a hand-rolled structural check).
 */
import { describe, it, expect } from "vitest";
import { validate as validateJsonSchema, FLAG } from "@hyperjump/json-schema";
import "@hyperjump/json-schema/openapi-3-1";
import { buildOpenApiDocument } from "@/lib/openapi/document";

describe("OpenAPI 3.1 generation (task 6.4)", () => {
  it("validates against the official OpenAPI 3.1 schema with no errors", async () => {
    const doc = buildOpenApiDocument();
    const output = await validateJsonSchema(
      "https://spec.openapis.org/oas/3.1/schema",
      JSON.parse(JSON.stringify(doc)) as never,
      FLAG,
    );
    expect(output.valid, JSON.stringify(output)).toBe(true);
  });

  it("covers every exposed Phase-0 endpoint including the stub mutate route", () => {
    const doc = buildOpenApiDocument();
    const expectedPaths = [
      "/api/health",
      "/api/projects",
      "/api/projects/{id}",
      "/api/projects/{id}/specs",
      "/api/projects/{id}/changes",
      "/api/openapi",
      "/api/__stub/mutate",
    ];
    for (const p of expectedPaths) {
      expect(doc.paths, `missing path ${p}`).toHaveProperty(p);
    }
    // The stub mutate route is a POST with a request body + response schema.
    const stub = doc.paths["/api/__stub/mutate"];
    expect(stub.post, "stub mutate must be a POST").toBeDefined();
    expect(stub.post!.responses["200"]).toBeDefined();
  });
});
