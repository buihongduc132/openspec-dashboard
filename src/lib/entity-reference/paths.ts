/**
 * Path-resolution table for entity references (design decision D8).
 *
 * Each resolver is a pure function that takes a narrow slice of the entity
 * row plus a {@link ReferenceContext} and returns the resolved
 * `{ path, readInstruction }` pair. Kinds with a real filesystem location
 * return an absolute path under the project's OpenSpec root; kinds with no
 * natural file location return a `dashboard://` logical path and a
 * `readInstruction` that tells the agent the entity lives in the dashboard
 * database (so it does not attempt a file read that cannot succeed).
 *
 * Path base selection (design decision D2): an explicitly configured
 * `repoRoot` takes precedence; otherwise the project's `rootPath` is used
 * directly (it is already absolute in the common local-dev case).
 */

import type { ReferenceContext } from "@/lib/entity-reference/types";

/** Result of resolving an entity's location. */
export interface ResolvedLocation {
  /** Absolute filesystem path or best-available location pointer. */
  path: string;
  /** Plain-English instruction telling an AI agent what to read. */
  readInstruction: string;
}

// ─── Narrow row input types ──────────────────────────────────────────────────
// Each interface captures only the fields needed for path resolution, so the
// full DB row (or a partial slice) can be passed interchangeably.

export interface ProjectPathRow {
  id: string;
  name: string;
  rootPath: string;
}
export interface ChangePathRow {
  id: string;
  name: string;
}
export interface TaskPathRow {
  id: string;
  taskNumber: string;
  title: string;
}
export interface SpecDomainPathRow {
  id: string;
  name: string;
}
export interface RequirementPathRow {
  id: string;
  title: string;
}
export interface SpecPathRow {
  id: string;
  name?: string;
  title?: string;
}
export interface SchemaPathRow {
  id: string;
  name: string;
}
export interface ContextStorePathRow {
  id: string;
  name: string;
  path: string;
}
export interface WorkspacePathRow {
  id: string;
  name: string;
}
export interface InitiativePathRow {
  id: string;
  title: string;
}

// ─── Base resolution ─────────────────────────────────────────────────────────

/**
 * Returns the absolute OpenSpec root to anchor relative locations under.
 * Prefers an explicitly configured `repoRoot`; falls back to the project's
 * `rootPath` (which is already absolute in the common case).
 */
function resolveBase(ctx: ReferenceContext): string {
  const root = ctx.repoRoot && ctx.repoRoot.trim().length > 0
    ? ctx.repoRoot
    : ctx.projectRootPath;
  return (root ?? "").replace(/\/+$/, "");
}

// ─── Per-kind resolvers ──────────────────────────────────────────────────────

export function resolveProjectLocation(
  row: ProjectPathRow,
  _ctx: ReferenceContext,
): ResolvedLocation {
  const path = row.rootPath.replace(/\/+$/, "");
  return {
    path,
    readInstruction: `This is project \`${row.name}\`, OpenSpec root at \`${path}\`.`,
  };
}

export function resolveChangeLocation(
  row: ChangePathRow,
  ctx: ReferenceContext,
): ResolvedLocation {
  const path = `${resolveBase(ctx)}/openspec/changes/${row.name}`;
  return {
    path,
    readInstruction:
      `Read \`proposal.md\`, \`design.md\`, \`tasks.md\` in this change dir (\`${path}\`).`,
  };
}

export function resolveTaskLocation(
  row: TaskPathRow,
  ctx: ReferenceContext,
): ResolvedLocation {
  const path = `${resolveBase(ctx)}/openspec/changes/${ctx.changeName}/tasks.md`;
  return {
    path,
    readInstruction: `Read \`${path}\`, find task ${row.taskNumber} and implement it.`,
  };
}

export function resolveSpecDomainLocation(
  row: SpecDomainPathRow,
  ctx: ReferenceContext,
): ResolvedLocation {
  const path = `${resolveBase(ctx)}/openspec/specs/${row.name}`;
  return {
    path,
    readInstruction: `Read the spec(s) in this domain dir (\`${path}\`).`,
  };
}

export function resolveRequirementLocation(
  row: RequirementPathRow,
  ctx: ReferenceContext,
): ResolvedLocation {
  const path = `${resolveBase(ctx)}/openspec/specs/${ctx.domainName}/spec.md`;
  return {
    path,
    readInstruction: `Read \`${path}\` and find the requirement \`${row.title}\`.`,
  };
}

export function resolveSpecLocation(
  row: SpecPathRow,
  ctx: ReferenceContext,
): ResolvedLocation {
  const path = `${resolveBase(ctx)}/openspec/specs/${ctx.domainName}/spec.md`;
  const label = row.name ?? row.title ?? "this spec";
  return {
    path,
    readInstruction: `Read \`${path}\` for the \`${label}\` spec.`,
  };
}

export function resolveSchemaLocation(
  row: SchemaPathRow,
  _ctx: ReferenceContext,
): ResolvedLocation {
  return {
    path: `dashboard://schema/${row.id}`,
    readInstruction:
      `Schema \`${row.name}\` is stored in the dashboard database, not a file; retrieve it via \`GET /api/schemas\`.`,
  };
}

export function resolveContextStoreLocation(
  row: ContextStorePathRow,
  _ctx: ReferenceContext,
): ResolvedLocation {
  return {
    path: `dashboard://context-store/${row.id}`,
    readInstruction:
      `Context store \`${row.name}\` is stored in the dashboard database at path \`${row.path}\`, not a file.`,
  };
}

export function resolveWorkspaceLocation(
  row: WorkspacePathRow,
  _ctx: ReferenceContext,
): ResolvedLocation {
  return {
    path: `dashboard://workspace/${row.id}`,
    readInstruction:
      `Workspace \`${row.name}\` is stored in the dashboard database, not a file.`,
  };
}

export function resolveInitiativeLocation(
  row: InitiativePathRow,
  _ctx: ReferenceContext,
): ResolvedLocation {
  return {
    path: `dashboard://initiative/${row.id}`,
    readInstruction:
      `Initiative \`${row.title}\` is stored in the dashboard database, not a file.`,
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Union of all supported entity row shapes, for the {@link resolveLocation}
 * dispatcher. The runtime row is selected by `type` by the caller; the union
 * keeps the call site type-checked without forcing a per-kind switch there.
 */
export type AnyPathRow =
  | ProjectPathRow
  | ChangePathRow
  | TaskPathRow
  | SpecDomainPathRow
  | RequirementPathRow
  | SpecPathRow
  | SchemaPathRow
  | ContextStorePathRow
  | WorkspacePathRow
  | InitiativePathRow;

/**
 * Resolve a location for any supported entity kind by its type tag.
 * Used by the builder to avoid duplicating the per-kind dispatch.
 */
export function resolveLocation(
  type:
    | "project"
    | "change"
    | "task"
    | "spec-domain"
    | "requirement"
    | "spec"
    | "schema"
    | "context-store"
    | "workspace"
    | "initiative",
  row: AnyPathRow,
  ctx: ReferenceContext,
): ResolvedLocation {
  switch (type) {
    case "project":
      return resolveProjectLocation(row as ProjectPathRow, ctx);
    case "change":
      return resolveChangeLocation(row as ChangePathRow, ctx);
    case "task":
      return resolveTaskLocation(row as TaskPathRow, ctx);
    case "spec-domain":
      return resolveSpecDomainLocation(row as SpecDomainPathRow, ctx);
    case "requirement":
      return resolveRequirementLocation(row as RequirementPathRow, ctx);
    case "spec":
      return resolveSpecLocation(row as SpecPathRow, ctx);
    case "schema":
      return resolveSchemaLocation(row as SchemaPathRow, ctx);
    case "context-store":
      return resolveContextStoreLocation(row as ContextStorePathRow, ctx);
    case "workspace":
      return resolveWorkspaceLocation(row as WorkspacePathRow, ctx);
    case "initiative":
      return resolveInitiativeLocation(row as InitiativePathRow, ctx);
    default: {
      // Exhaustiveness guard — compile error if a new kind is added
      // without a case.
      const _exhaustive: never = type;
      throw new Error(`Unsupported entity type: ${String(_exhaustive)}`);
    }
  }
}
