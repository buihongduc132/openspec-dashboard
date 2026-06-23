/**
 * Task 3.5 — Gap registry of upstream constructs the parser cannot confirm from
 * documentation (NFR-5).
 *
 * NFR-5 requires the parser to ship (a) an enumerated list of the documented
 * upstream rules it implements (see `./rules.ts`) and (b) a gap registry of
 * upstream constructs it cannot confirm from documentation. Encountering an
 * unregistered construct during parse SHALL append it to the gap registry and
 * continue parsing (never crash, never silently mishandle).
 *
 * This module owns the registry data structure and the frontmatter-key
 * recording helper. It is intentionally separate from the rule enumeration so
 * the registry can evolve (dedupe, persistence) without touching the
 * documented-rule list.
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`,
 * Requirement "Documented-rule enumeration and gap registry (NFR-5)".
 */

/** A single gap-registry entry: an observed but undocumented construct. */
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

/**
 * Construct a fresh, empty gap registry. Dedupes by (file, line, construct) so
 * a construct observed many times during a single parse is recorded once.
 */
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

/**
 * YAML front-matter keys the documented rules explicitly recognise (see
 * `frontmatter.block` in the rule enumeration). Any other key is a gap.
 */
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
