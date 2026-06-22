/**
 * Task 1.11 — OpenAPI skeleton (req 08 §8.1).
 *
 * The dashboard SHALL ship a versioned OpenAPI 3.1 document describing its
 * REST surface. The skeleton must, at minimum, declare every read endpoint
 * named in plan §0.5:
 *   - GET /api/health
 *   - GET /api/projects
 *   - GET /api/projects/{id}
 *   - GET /api/projects/{id}/specs
 *   - GET /api/projects/{id}/changes
 *
 * The document must be self-describing: it must also expose itself via
 * `GET /api/openapi` so tooling can discover it.
 */
import { describe, it, expect } from "vitest";
import { buildOpenApiDocument, OPENAPI_VERSION } from "@/lib/openapi/document";

describe("OpenAPI document — task 1.11 skeleton (req 08 §8.1)", () => {
  it("declares OpenAPI 3.1.0", () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toBe(OPENAPI_VERSION);
    expect(doc.openapi).toBe("3.1.0");
  });

  it("carries an informational block with title + version", () => {
    const doc = buildOpenApiDocument();
    expect(doc.info).toBeDefined();
    expect(typeof doc.info.title).toBe("string");
    expect(doc.info.title.length).toBeGreaterThan(0);
    expect(typeof doc.info.version).toBe("string");
    expect(doc.info.version.length).toBeGreaterThan(0);
  });

  it("declares every required read path with a GET operation", () => {
    const doc = buildOpenApiDocument();
    const required = [
      "/api/health",
      "/api/projects",
      "/api/projects/{id}",
      "/api/projects/{id}/specs",
      "/api/projects/{id}/changes",
      "/api/openapi",
    ];
    for (const p of required) {
      expect(doc.paths, `missing path ${p}`).toHaveProperty(p);
      expect(doc.paths[p], `path ${p} missing GET`).toHaveProperty("get");
    }
  });

  it("documents {id} as a path parameter of type uuid", () => {
    const doc = buildOpenApiDocument();
    const show = doc.paths["/api/projects/{id}"].get!;
    expect(Array.isArray(show.parameters)).toBe(true);
    const idParam = show.parameters!.find(
      (p) => "in" in p && p.in === "path" && p.name === "id",
    );
    expect(idParam, "{id} path parameter must be documented").toBeDefined();
    expect((idParam as any).schema.format).toBe("uuid");
  });

  it("marks the OpenAPI document path as the self-discovery endpoint", () => {
    const doc = buildOpenApiDocument();
    const self = doc.paths["/api/openapi"].get!;
    expect(self.responses).toHaveProperty("200");
  });
});
