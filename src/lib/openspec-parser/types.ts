/**
 * Task 1.7 — OpenSpec parser port: type definitions.
 *
 * Stable in-memory model produced by parsing the upstream OpenSpec Markdown
 * tree. Shape derived from the documented rule spec in
 * `openspec/changes/add-local-content-projection/specs/openspec-parser/spec.md`
 * and `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`.
 */

/** Severity for structured parse issues (never thrown). */
export type Severity = "warn" | "error";

/**
 * Structured parse issue. The parser never throws on malformed input; it
 * collects one of these per problem and continues (NFR-5, INV-2).
 */
export interface ParseIssue {
  /** Stable machine identifier for the issue class. */
  kind: string;
  /** File path the issue was found in (relative to project root or as given). */
  file: string;
  /** 1-based line number when applicable. */
  line?: number;
  severity: Severity;
  message: string;
}

/** A `#### Scenario: <name>` block within a requirement. */
export interface Scenario {
  name: string;
  /** Verbatim body lines under the scenario header (trimmed of the header). */
  body: string;
  /** 1-based source line of the scenario header. */
  line: number;
}

/** A `### Requirement: <name>` block within a spec. */
export interface RequirementBlock {
  name: string;
  body: string;
  scenarios: Scenario[];
  /** 1-based source line of the requirement header. */
  line: number;
}

/** Model produced by {@link parseMainSpec}. */
export interface MainSpecModel {
  /** Capability/domain name, derived from `filePath` or explicit arg. */
  capability: string;
  requirements: RequirementBlock[];
}

export interface MainSpecResult {
  model: MainSpecModel;
  issues: ParseIssue[];
}

/** Buckets produced by {@link parseDeltaSpec}. */
export interface DeltaPlan {
  added: RequirementBlock[];
  modified: RequirementBlock[];
  /** Bare requirement names slated for removal. */
  removed: string[];
  /** FROM/TO pairs for renamed requirements. */
  renamed: { from: string; to: string }[];
  /** Whether each verb section was present in the source. */
  sectionPresence: {
    added: boolean;
    modified: boolean;
    removed: boolean;
    renamed: boolean;
  };
}

export interface DeltaSpecResult {
  plan: DeltaPlan;
  issues: ParseIssue[];
}

/** A single checkbox task line from `tasks.md`. */
export interface TaskItem {
  /** Verbatim checkbox marker, e.g. `[ ]`, `[x]`, `[X]` (preserved as-written). */
  marker: string;
  checked: boolean;
  label: string;
  /** 1-based source line. */
  line: number;
  /** Nested sub-items (more-indented checkbox lines). */
  children: TaskItem[];
}

export interface TasksResult {
  items: TaskItem[];
  issues: ParseIssue[];
}

/** Subset of `openspec/config.yaml` the dashboard cares about. */
export interface ConfigModel {
  defaultSchema: string | null;
  profiles: string[];
  tools: string[];
}

/** A delta spec parsed out of a change directory. */
export interface DeltaSpec {
  /** Domain/capability the delta targets. */
  domain: string;
  plan: DeltaPlan;
  issues: ParseIssue[];
}

/** Artifacts attached to a change (proposal/design/etc). */
export interface ChangeArtifacts {
  proposal?: string;
  design?: string;
  /** Any other top-level `*.md` artifact (RUN.md, NOTES.md, …). */
  other: Record<string, string>;
}

/** Model produced by {@link parseChange}. */
export interface ChangeModel {
  name: string;
  artifacts: ChangeArtifacts;
  tasks: TasksResult;
  deltaSpecs: Record<string, DeltaSpec>;
  issues: ParseIssue[];
}

/** A single main spec under `openspec/specs/`. */
export interface SpecModel {
  capability: string;
  filePath: string;
  requirements: RequirementBlock[];
}

/** Model produced by {@link parseProject}. */
export interface ProjectModel {
  config: ConfigModel;
  specs: SpecModel[];
  changes: ChangeModel[];
  issues: ParseIssue[];
}
