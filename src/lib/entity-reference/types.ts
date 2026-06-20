/**
 * Entity reference types for the copy-entity-reference feature.
 *
 * Defines the canonical payload shape for describing any dashboard entity
 * to an AI agent, including type, location, metadata, and read instructions.
 */

/**
 * Supported entity types that can generate a reference.
 * Covers all entity kinds surfaced in the dashboard.
 */
export type EntityType =
  | "project"
  | "change"
  | "spec"
  | "spec-domain"
  | "requirement"
  | "task"
  | "schema"
  | "context-store"
  | "workspace"
  | "initiative";

/**
 * Canonical reference payload for any entity.
 * Flat identity fields (type, id, title, path, readInstruction) are constant
 * across kinds; metadata carries kind-specific fields. Optional fields are
 * omitted when absent (never null).
 */
export interface EntityReference {
  /** Entity kind */
  type: EntityType;
  /** Stable identifier (DB id or logical key) */
  id: string;
  /** Human-readable heading */
  title: string;
  /** Absolute filesystem path or best-available location pointer */
  path: string;
  /** Plain-English instruction telling an AI agent which file(s) to read */
  readInstruction: string;
  /** Kind-specific scalar metadata (status, owner, numbers, dates, etc.) */
  metadata: Record<string, string | number | boolean | Date>;
  /** ISO-8601 timestamp when the reference was generated */
  generatedAt: string;
}

/**
 * Context for building a reference: carries the repo-root base and
 * relational lookups (project name, change name, domain name) needed
 * to resolve absolute paths per entity kind.
 */
export interface ReferenceContext {
  /** Configured repo-root base for absolute path resolution */
  repoRoot: string;
  /** Project name (for readInstruction text) */
  projectName?: string;
  /** Project rootPath (filesystem anchor for path resolution) */
  projectRootPath?: string;
  /** Change name (for change/task/spec path resolution) */
  changeName?: string;
  /** Spec domain name (for spec-domain/requirement path resolution) */
  domainName?: string;
}
