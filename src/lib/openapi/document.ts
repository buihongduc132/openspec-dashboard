/**
 * Task 1.11 — OpenAPI 3.1 skeleton (req 08 §8.1, plan §0.5).
 *
 * The dashboard exposes its REST surface via a self-describing OpenAPI 3.1
 * document served at `GET /api/openapi`. This module is the single source of
 * truth for that document — route handlers import `buildOpenApiDocument()` so
 * the served spec can never drift from the in-code shape.
 *
 * Scope of the Phase-0 skeleton: declare every read endpoint from plan §0.5
 * (`GET /api/health`, `GET /api/projects`, `GET /api/projects/{id}`,
 * `GET /api/projects/{id}/specs`, `GET /api/projects/{id}/changes`) plus the
 * self-discovery `GET /api/openapi` endpoint. Mutating endpoints, ETag
 * semantics (INV-7) and idempotency keys are added by later tasks; the
 * skeleton documents them as TODO so consumers can plan against the shape.
 */

/** Semantic version of the OpenAPI specification language in use. */
export const OPENAPI_VERSION = "3.1.0";

/** Version of THIS dashboard's REST surface (req 08 §8.1a — major bumps on breaking). */
export const API_VERSION = "0.1.0";

export const API_TITLE = "OpenSpec Dashboard REST API";

/** Path prefix shared by every dashboard REST route (Next.js App Router mount). */
export const API_PREFIX = "/api";

/** Common 404 response used by id-scoped read endpoints. */
const notFoundResponse = (): OpenApiResponseObject => ({
  description: "Not found",
  content: { "application/json": { schema: ref("ErrorResponse") } },
});

/** Common 500 response used by every endpoint. */
const internalErrorResponse = (): OpenApiResponseObject => ({
  description: "Internal server error",
  content: { "application/json": { schema: ref("ErrorResponse") } },
});

/** Convenience: a `$ref` to a component schema. */
function ref(name: string): OpenApiReference {
  return { $ref: `#/components/schemas/${name}` };
}

/** Convenience: a JSON `200` response wrapping a component schema. */
function okResponse(desc: string, schemaName: string): OpenApiResponseObject {
  return {
    description: desc,
    content: { "application/json": { schema: ref(schemaName) } },
  };
}

/** The `{id}` path parameter reused by every project-scoped read endpoint. */
const idPathParameter = (): OpenApiParameterObject => ({
  name: "id",
  in: "path",
  required: true,
  description: "Project UUID",
  schema: { type: "string", format: "uuid" },
});

/**
 * Build the OpenAPI 3.1 document for the dashboard's REST surface.
 *
 * Pure function — no I/O — so it is trivially unit-testable and safe to call
 * from the Next.js route handler on every request. Later tasks extend the
 * returned document with mutating endpoints + ETag/idempotency schemas.
 */
export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description:
        "Server/UI layer over the OpenSpec CLI spec-driven-development workflow. " +
        "Phase-0 skeleton (task 1.11): read endpoints + self-discovery only. " +
        "Mutating endpoints, `If-Match` ETag semantics (INV-7) and idempotency " +
        "keys are added by later tasks (req 08 §8.1).",
    },
    paths: {
      [`${API_PREFIX}/health`]: {
        get: {
          summary: "Health probe",
          description: "Liveness/readiness probe backed by a `select 1`.",
          operationId: "getHealth",
          tags: ["system"],
          responses: {
            "200": okResponse("Service healthy", "HealthResponse"),
            "500": okResponse("Service unhealthy", "HealthResponse"),
          },
        },
      },
      [`${API_PREFIX}/projects`]: {
        get: {
          summary: "List projects",
          description: "Returns every registered OpenSpec repository.",
          operationId: "listProjects",
          tags: ["projects"],
          responses: {
            "200": okResponse("Projects", "ProjectList"),
            "500": internalErrorResponse(),
          },
        },
      },
      [`${API_PREFIX}/projects/{id}`]: {
        get: {
          summary: "Get a project",
          description: "Returns a single registered project by UUID.",
          operationId: "getProject",
          tags: ["projects"],
          parameters: [idPathParameter()],
          responses: {
            "200": okResponse("Project", "Project"),
            "404": notFoundResponse(),
            "500": internalErrorResponse(),
          },
        },
      },
      [`${API_PREFIX}/projects/{id}/specs`]: {
        get: {
          summary: "List spec domains for a project",
          description:
            "Returns the spec domains (and their specs) registered for a project.",
          operationId: "listProjectSpecs",
          tags: ["specs"],
          parameters: [idPathParameter()],
          responses: {
            "200": okResponse("Spec domains", "SpecDomainList"),
            "404": notFoundResponse(),
            "500": internalErrorResponse(),
          },
        },
      },
      [`${API_PREFIX}/projects/{id}/changes`]: {
        get: {
          summary: "List changes for a project",
          description:
            "Returns the changes (proposed/in-flight/archived) for a project.",
          operationId: "listProjectChanges",
          tags: ["changes"],
          parameters: [idPathParameter()],
          responses: {
            "200": okResponse("Changes", "ChangeList"),
            "404": notFoundResponse(),
            "500": internalErrorResponse(),
          },
        },
      },
      [`${API_PREFIX}/openapi`]: {
        get: {
          summary: "Self-discovery endpoint",
          description:
            "Returns this OpenAPI 3.1 document. Tooling (and AI agents) use " +
            "it to discover the dashboard's REST surface (req 08 §8.1a).",
          operationId: "getOpenApiDocument",
          tags: ["system"],
          responses: {
            "200": okResponse("OpenAPI 3.1 document", "OpenApiDocument"),
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
        ErrorResponse: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" } },
        },
        Project: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            rootPath: { type: "string" },
            defaultSchema: { type: "string" },
            context: { type: "string", nullable: true },
            enrollmentSource: { type: "string" },
            remoteGitUrl: { type: "string", nullable: true },
            projected: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ProjectList: {
          type: "array",
          items: ref("Project"),
        },
        SpecDomain: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            projectId: { type: "string", format: "uuid" },
            name: { type: "string" },
            purpose: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        SpecDomainList: {
          type: "array",
          items: ref("SpecDomain"),
        },
        Change: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            projectId: { type: "string", format: "uuid" },
            name: { type: "string" },
            schema: { type: "string" },
            status: { type: "string" },
            description: { type: "string", nullable: true },
            initiativeId: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ChangeList: {
          type: "array",
          items: ref("Change"),
        },
        OpenApiDocument: {
          type: "object",
          description: "An OpenAPI 3.1 document.",
        },
      },
    },
    tags: [
      { name: "system", description: "System / health / self-discovery endpoints." },
      { name: "projects", description: "Project registration + reads (req 01)." },
      { name: "specs", description: "Spec-domain reads (req 02)." },
      { name: "changes", description: "Change reads (req 03)." },
    ],
  };
}

/* ─── Local OpenAPI 3.1 typings ──────────────────────────────────────────────
 * We hand-roll the minimum typings rather than pulling in a heavyweight
 * OpenAPI typings package — the skeleton (task 1.11) only needs the shapes
 * referenced above. Later tasks that broaden the surface can swap these for a
 * generated `openapi-typescript` bundle without touching the call sites.
 */

export interface OpenApiReference {
  $ref: string;
}

export interface OpenApiSchemaObject {
  type?: string;
  format?: string;
  nullable?: boolean;
  description?: string;
  items?: OpenApiSchemaObject | OpenApiReference;
  required?: string[];
  properties?: Record<string, OpenApiSchemaObject | OpenApiReference>;
}

export interface OpenApiParameterObject {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema: OpenApiSchemaObject;
}

export interface OpenApiResponseObject {
  description: string;
  content?: Record<string, { schema: OpenApiSchemaObject | OpenApiReference }>;
}

export interface OpenApiOperationObject {
  summary?: string;
  description?: string;
  operationId: string;
  tags?: string[];
  parameters?: OpenApiParameterObject[];
  responses: Record<string, OpenApiResponseObject>;
}

export interface OpenApiPathItemObject {
  get?: OpenApiOperationObject;
  post?: OpenApiOperationObject;
  patch?: OpenApiOperationObject;
  delete?: OpenApiOperationObject;
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, OpenApiPathItemObject>;
  components?: {
    schemas?: Record<string, OpenApiSchemaObject>;
  };
  tags?: { name: string; description?: string }[];
}
