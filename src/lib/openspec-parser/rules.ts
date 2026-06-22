/**
 * Task 1.7 — Documented upstream rules + gap registry (NFR-5).
 *
 * NFR-5 requires the parser to ship (a) an enumerated list of the documented
 * upstream rules it implements and (b) a gap registry of upstream constructs it
 * cannot confirm from documentation. Encountering an unregistered construct
 * during parse SHALL append it to the gap registry and continue parsing.
 *
 * Source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "OpenSpec parser port") and the
 * detailed rule spec in `add-local-content-projection/specs/openspec-parser`.
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

/** A single gap-registry entry. */
export interface GapEntry {
  /** File the unrecognised construct was observed in. */
  file: string;
  /** 1-based line when known. */
  line?: number;
  /** Free-form description of the observed construct. */
  construct: string;
  /** Nearest documented rule id the construct resembles, if any. */
  nearestRule?: string;
}

/**
 * Mutable gap registry. Constructs are appended as they are encountered; the
 * registry is passed by reference so callers can read it after parsing.
 */
export interface GapRegistry {
  entries: GapEntry[];
  /** Append a new gap observation (no-op if a duplicate already exists). */
  record: (entry: GapEntry) => void;
}

/** Construct a fresh, empty gap registry. */
export function createGapRegistry(): GapRegistry {
  const entries: GapEntry[] = [];
  const seen = new Set<string>();
  return {
    entries,
    record(entry) {
      const key = `${entry.file}|${entry.line ?? -1}|${entry.construct}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push(entry);
    },
  };
}

/** YAML front-matter keys the documented rules explicitly recognise. */
const KNOWN_FRONTMATTER_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "defaultSchema",
  "created",
]);

/**
 * Inspect a parsed front-matter block and record any keys not covered by the
 * documented rules into the gap registry (NFR-5).
 */
export function recordUnknownFrontmatter(
  file: string,
  keys: Record<string, unknown>,
  gap: GapRegistry,
): void {
  for (const key of Object.keys(keys)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) {
      gap.record({
        file,
        construct: `frontmatter-key:${key}`,
        nearestRule: "frontmatter.block",
      });
    }
  }
}
