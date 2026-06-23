/**
 * Task 3.5 — Documented-rule enumeration of upstream OpenSpec Markdown
 * constructs the parser implements (NFR-5).
 *
 * This module ships an enumerated list of the documented upstream rules the
 * parser recognises. Each rule is a stable id + description. Add a new entry
 * only when the parser actively recognises the construct; anything observed in
 * the wild that is NOT in this list goes into the gap registry
 * (see `./gap-registry.ts`).
 *
 * This is intentionally separate from the gap-registry data structure so the
 * rule list can remain a static enumeration while the registry evolves
 * (dedupe, persistence) independently.
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`,
 * Requirement "Documented-rule enumeration and gap registry (NFR-5)".
 */

/** One documented upstream rule the parser implements. */
export interface DocumentedRule {
  /** Stable machine identifier (namespaced by concern). */
  id: string;
  /** Human-readable description of what the rule recognises. */
  description: string;
}

/**
 * The enumerated set of upstream OpenSpec Markdown rules this parser port
 * implements. Each id maps 1:1 to behaviour exercised in the parser. Add a new
 * entry here only when the parser actively recognises the construct; anything
 * observed in the wild that is NOT in this list is recorded in the gap
 * registry.
 */
export const DOCUMENTED_RULES: readonly DocumentedRule[] = [
  {
    id: "main-spec.requirement-section",
    description:
      "A `## Requirements` top-level section that scopes the requirement blocks of a main spec.",
  },
  {
    id: "main-spec.requirement-block",
    description:
      "A `### Requirement: <name>` header followed by its prose body and nested scenarios.",
  },
  {
    id: "main-spec.scenario-block",
    description:
      "A `#### Scenario: <name>` header followed by `- **WHEN**` / `- **THEN**` bullet lines.",
  },
  {
    id: "main-spec.fenced-code-ignore",
    description:
      "Triple-backtick fenced code blocks are line-preservingly stripped before header detection so decoy headers inside them are ignored.",
  },
  {
    id: "delta.added-section",
    description: "A `## ADDED Requirements` (case-insensitive) section in a delta spec.",
  },
  {
    id: "delta.modified-section",
    description: "A `## MODIFIED Requirements` (case-insensitive) section in a delta spec.",
  },
  {
    id: "delta.removed-section",
    description: "A `## REMOVED Requirements` (case-insensitive) section in a delta spec.",
  },
  {
    id: "delta.renamed-section",
    description: "A `## RENAMED Requirements` (case-insensitive) section in a delta spec.",
  },
  {
    id: "tasks.checkbox-line",
    description:
      "A `- [ ]` / `- [x]` / `- [X]` checkbox task line, preserving the verbatim marker bytes.",
  },
  {
    id: "tasks.nested-checkbox",
    description: "An indented checkbox line that nests under the previous less-indented task.",
  },
  {
    id: "config.default-schema",
    description: "The `defaultSchema` / `schema` scalar key in `openspec/config.yaml`.",
  },
  {
    id: "config.tools-list",
    description: "The `tools` YAML sequence in `openspec/config.yaml`.",
  },
  {
    id: "config.profiles-list",
    description: "The `profiles` YAML sequence in `openspec/config.yaml`.",
  },
  {
    id: "frontmatter.block",
    description:
      "A leading `---`-delimited YAML front-matter block; recognised scalar keys: schema.",
  },
] as const;

/** Set of rule ids for O(1) membership checks. */
export const DOCUMENTED_RULE_IDS: ReadonlySet<string> = new Set(
  DOCUMENTED_RULES.map((r) => r.id),
);
