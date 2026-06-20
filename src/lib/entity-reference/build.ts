/**
 * Canonical entity-reference payload builder (design decisions D1 + D3).
 *
 * `buildEntityReference(type, row, ctx)` is the single source of truth for the
 * reference payload shape consumed by every surface (list rows, detail headers,
 * the kanban dialog) and the `/api/reference/{type}/{id}` endpoint. It:
 *
 * 1. Resolves the entity location (`path` + `readInstruction`) by delegating to
 *    the pure per-kind resolvers in {@link paths.ts} (D8 table).
 * 2. Picks a human-readable `title` per kind.
 * 3. Assembles kind-specific scalar `metadata`, **omitting** any field whose
 *    value is `null` or `undefined` (spec: "Unknown metadata fields are
 *    omitted, not null"). Free-text bodies are never inlined (risk: large
 *    payloads) — they remain reachable via `path`.
 * 4. Stamps `generatedAt` with an ISO-8601 timestamp.
 *
 * The result always carries the full set of flat identity fields
 * (`type`, `id`, `title`, `path`, `readInstruction`, `generatedAt`) so agents
 * can rely on a stable contract regardless of kind.
 */

import type { EntityReference, EntityType, ReferenceContext } from "@/lib/entity-reference/types";
import { resolveLocation } from "@/lib/entity-reference/paths";
import { isSupportedType } from "@/lib/entity-reference/supported-types";

// ─── Narrow build-row input types ────────────────────────────────────────────
// Each row captures the identity + scalar metadata fields the builder reads for
// that kind. Optional fields may be absent; the builder omits them when so.

export interface ProjectBuildRow {
  id: string;
  name: string;
  rootPath: string;
  status?: string | null;
  owner?: string | null;
}
export interface ChangeBuildRow {
  id: string;
  name: string;
  title?: string | null;
  status?: string | null;
  owner?: string | null;
}
export interface TaskBuildRow {
  id: string;
  taskNumber: string;
  title: string;
  status?: string | null;
  assignee?: string | null;
  priority?: string | null;
  dueDate?: string | null;
}
export interface SpecDomainBuildRow {
  id: string;
  name: string;
  title?: string | null;
  status?: string | null;
  owner?: string | null;
}
export interface RequirementBuildRow {
  id: string;
  title: string;
  status?: string | null;
  owner?: string | null;
}
export interface SpecBuildRow {
  id: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
}
export interface SchemaBuildRow {
  id: string;
  name: string;
  version?: number | string | null;
  status?: string | null;
}
export interface ContextStoreBuildRow {
  id: string;
  name: string;
  path: string;
  status?: string | null;
}
export interface WorkspaceBuildRow {
  id: string;
  name: string;
  status?: string | null;
}
export interface InitiativeBuildRow {
  id: string;
  title: string;
  status?: string | null;
  owner?: string | null;
}

/** Union of all supported build-row shapes. */
export type BuildRow =
  | ProjectBuildRow
  | ChangeBuildRow
  | TaskBuildRow
  | SpecDomainBuildRow
  | RequirementBuildRow
  | SpecBuildRow
  | SchemaBuildRow
  | ContextStoreBuildRow
  | WorkspaceBuildRow
  | InitiativeBuildRow;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type MetaValue = string | number | boolean | Date;
type MetaMap = Record<string, MetaValue>;

/**
 * Returns a new metadata map containing only entries whose value is neither
 * `null` nor `undefined`. Per the spec, absent optional fields are omitted
 * rather than serialized as `null`.
 */
function compactMeta(input: Record<string, unknown>): MetaMap {
  const out: MetaMap = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    out[key] = value as MetaValue;
  }
  return out;
}

// ─── Per-kind assemblers ─────────────────────────────────────────────────────

function assembleProject(row: ProjectBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("project", row, ctx);
  return {
    type: "project",
    id: row.id,
    title: row.name,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({ status: row.status, owner: row.owner }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleChange(row: ChangeBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("change", row, ctx);
  return {
    type: "change",
    id: row.id,
    title: row.title ?? row.name,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({ name: row.name, status: row.status, owner: row.owner }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleTask(row: TaskBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("task", row, ctx);
  return {
    type: "task",
    id: row.id,
    title: row.title,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({
      taskNumber: row.taskNumber,
      status: row.status,
      assignee: row.assignee,
      priority: row.priority,
      dueDate: row.dueDate,
      changeName: ctx.changeName,
      projectName: ctx.projectName,
    }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleSpecDomain(row: SpecDomainBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("spec-domain", row, ctx);
  return {
    type: "spec-domain",
    id: row.id,
    title: row.title ?? row.name,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({ name: row.name, status: row.status, owner: row.owner }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleRequirement(row: RequirementBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("requirement", row, ctx);
  return {
    type: "requirement",
    id: row.id,
    title: row.title,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({
      status: row.status,
      owner: row.owner,
      domainName: ctx.domainName,
    }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleSpec(row: SpecBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation(
    "spec",
    { id: row.id, name: row.name ?? undefined, title: row.title ?? undefined },
    ctx,
  );
  return {
    type: "spec",
    id: row.id,
    title: row.title ?? row.name ?? "spec",
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({
      name: row.name,
      title: row.title,
      domainName: ctx.domainName,
      status: row.status,
    }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleSchema(row: SchemaBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("schema", row, ctx);
  return {
    type: "schema",
    id: row.id,
    title: row.name,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({ name: row.name, version: row.version, status: row.status }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleContextStore(row: ContextStoreBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("context-store", row, ctx);
  return {
    type: "context-store",
    id: row.id,
    title: row.name,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({ name: row.name, status: row.status }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleWorkspace(row: WorkspaceBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("workspace", row, ctx);
  return {
    type: "workspace",
    id: row.id,
    title: row.name,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({ name: row.name, status: row.status }),
    generatedAt: new Date().toISOString(),
  };
}

function assembleInitiative(row: InitiativeBuildRow, ctx: ReferenceContext): EntityReference {
  const loc = resolveLocation("initiative", row, ctx);
  return {
    type: "initiative",
    id: row.id,
    title: row.title,
    path: loc.path,
    readInstruction: loc.readInstruction,
    metadata: compactMeta({ status: row.status, owner: row.owner }),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Public builder ──────────────────────────────────────────────────────────

/**
 * Build the canonical reference payload for any supported entity kind.
 *
 * @param type  Entity kind (validated against the supported taxonomy).
 * @param row   Entity row carrying identity + scalar metadata fields.
 * @param ctx   Reference context (repo-root base + relational lookups).
 * @returns     The canonical {@link EntityReference} payload with nulls omitted.
 * @throws      `TypeError` when `type` is not a supported entity kind.
 */
export function buildEntityReference(
  type: EntityType,
  row: BuildRow,
  ctx: ReferenceContext,
): EntityReference {
  // Runtime guard (task 2.3): reject unsupported kinds with a clean TypeError
  // before dispatching. This mirrors the API route's 400 taxonomy check via
  // the shared `isSupportedType` helper, so both surfaces stay in lock-step.
  if (!isSupportedType(type)) {
    throw new TypeError(`Unsupported entity type: ${String(type)}`);
  }
  switch (type) {
    case "project":
      return assembleProject(row as ProjectBuildRow, ctx);
    case "change":
      return assembleChange(row as ChangeBuildRow, ctx);
    case "task":
      return assembleTask(row as TaskBuildRow, ctx);
    case "spec-domain":
      return assembleSpecDomain(row as SpecDomainBuildRow, ctx);
    case "requirement":
      return assembleRequirement(row as RequirementBuildRow, ctx);
    case "spec":
      return assembleSpec(row as SpecBuildRow, ctx);
    case "schema":
      return assembleSchema(row as SchemaBuildRow, ctx);
    case "context-store":
      return assembleContextStore(row as ContextStoreBuildRow, ctx);
    case "workspace":
      return assembleWorkspace(row as WorkspaceBuildRow, ctx);
    case "initiative":
      return assembleInitiative(row as InitiativeBuildRow, ctx);
    default: {
      // Exhaustiveness guard — compile error if a new kind is added without a
      // case. Runtime guard mirrors the API endpoint's 400 taxonomy check.
      const _exhaustive: never = type;
      throw new TypeError(`Unsupported entity type: ${String(_exhaustive)}`);
    }
  }
}
