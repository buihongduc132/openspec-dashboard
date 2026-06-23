/**
 * Task 2.21 — Schema validation (req 05.7).
 *
 * Validates a schema definition (YAML) + artifact list against the documented
 * upstream invariants. Each finding carries a stable rule id, severity
 * (error/warn), a human-readable message, and — where deterministic — a
 * suggested fix.
 *
 * Invariants checked:
 *   - YAML is syntactically valid (`schema.yaml-syntax`)
 *   - No circular artifact dependency graph (`schema.circular-dep`)
 *   - Artifact IDs are kebab-case and unique (`schema.artifact-id-format`)
 *   - `apply.tracks` references a real artifact path (`schema.tracks-ref-invalid`)
 *   - `apply.requires` references real artifact IDs (`schema.apply-requires-ref-invalid`)
 *   - `requires` references real artifact IDs (`schema.requires-ref-invalid`)
 *   - Template files exist when paths are provided (`schema.template-missing`)
 *
 * Source: `flow/requirements/05-schemas.md` §5.7.
 */

import { parse as parseYaml } from "yaml";

/** Severity matches the upstream `openspec validate` contract. */
export type SchemaSeverity = "error" | "warn";

/** One structured schema validation finding (req 05.7 AC a/b). */
export interface SchemaValidationFinding {
  /** Stable machine rule id (namespaced by concern). */
  ruleId: string;
  severity: SchemaSeverity;
  message: string;
  /** Deterministic suggested fix; absent when no single fix applies. */
  suggestedFix?: string;
  /** Artifact id the finding relates to, when applicable. */
  artifactId?: string;
}

/** The parsed shape of a schema definition YAML. */
export interface ParsedSchemaDefinition {
  name?: string;
  version?: string | number;
  artifacts?: ParsedArtifact[];
}

export interface ParsedArtifact {
  id: string;
  generates: string;
  requires?: string[];
  template?: string;
  apply?: {
    requires?: string[];
    tracks?: string;
  };
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Validate a schema definition (YAML text). Returns an array of findings;
 * empty array means the schema is valid. Pure function — no side effects
 * beyond reading template files from disk (when paths are provided).
 */
export function validateSchema(definition: string): SchemaValidationFinding[] {
  return validateSchemaIn(definition, undefined);
}

/**
 * Variant that resolves template paths relative to a base directory and
 * performs the on-disk existence check (req 05.7 AC b "Apply fix").
 *
 * Server-only: uses `node:fs`/`node:path` via a dynamic import so the pure
 * `validateSchema(definition)` path stays importable from client bundles
 * (Next.js tree-shakes the dynamic import out of the client chunk).
 */
export async function validateSchemaWithBase(
  definition: string,
  baseDir: string,
): Promise<SchemaValidationFinding[]> {
  const findings = validateSchemaIn(definition, undefined);
  const [{ default: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);
  let parsed: ParsedSchemaDefinition | undefined;
  try {
    const loaded = parseYaml(definition);
    if (loaded && typeof loaded === "object") parsed = loaded as ParsedSchemaDefinition;
  } catch {
    // validateSchemaIn already emitted a syntax finding; nothing more to do.
    return findings;
  }
  const artifacts = Array.isArray(parsed?.artifacts) ? parsed!.artifacts! : [];
  for (const art of artifacts) {
    const id = String(art.id ?? "");
    if (art.template && String(art.template).trim().length > 0) {
      const tplPath = path.resolve(baseDir, String(art.template));
      let exists = false;
      try {
        if (fs.statSync(tplPath).isFile()) exists = true;
      } catch {
        exists = false;
      }
      if (!exists) {
        findings.push({
          ruleId: "schema.template-missing",
          severity: "error",
          artifactId: id,
          message: `Artifact "${id}" references missing template file "${art.template}".`,
          suggestedFix: `Create the template at ${art.template}.`,
        });
      }
    }
  }
  return findings;
}

function validateSchemaIn(
  definition: string,
  baseDir: string | undefined,
): SchemaValidationFinding[] {
  const findings: SchemaValidationFinding[] = [];

  let parsed: ParsedSchemaDefinition;
  try {
    const loaded = parseYaml(definition);
    if (loaded == null || typeof loaded !== "object") {
      findings.push({
        ruleId: "schema.yaml-syntax",
        severity: "error",
        message: "Schema definition must be a non-empty YAML mapping.",
      });
      return findings;
    }
    parsed = loaded as ParsedSchemaDefinition;
  } catch (err) {
    findings.push({
      ruleId: "schema.yaml-syntax",
      severity: "error",
      message: `YAML syntax error: ${(err as Error).message}`,
      suggestedFix: "Fix the YAML indentation / structure and re-validate.",
    });
    return findings;
  }

  const artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
  if (artifacts.length === 0) {
    findings.push({
      ruleId: "schema.no-artifacts",
      severity: "error",
      message: "Schema must define at least one artifact.",
    });
    return findings;
  }

  const idToArtifact = new Map<string, ParsedArtifact>();
  const ids: string[] = [];

  // 1. Artifact ID format + uniqueness.
  for (const art of artifacts) {
    const id = String(art.id ?? "");
    ids.push(id);
    if (!KEBAB_CASE.test(id)) {
      const kebab = id
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[_\s]+/g, "-")
        .toLowerCase();
      findings.push({
        ruleId: "schema.artifact-id-format",
        severity: "error",
        artifactId: id,
        message: `Artifact id "${id}" is not kebab-case (lowercase letters/digits joined by single dashes).`,
        suggestedFix: `Rename to "${kebab}".`,
      });
      continue;
    }
    if (idToArtifact.has(id)) {
      findings.push({
        ruleId: "schema.artifact-id-duplicate",
        severity: "error",
        artifactId: id,
        message: `Artifact id "${id}" is duplicated. Artifact IDs must be unique within a schema.`,
        suggestedFix: "Rename one of the duplicate artifacts.",
      });
      continue;
    }
    idToArtifact.set(id, art);
  }

  // 2. requires references real artifact IDs.
  for (const art of artifacts) {
    const id = String(art.id ?? "");
    const requires = Array.isArray(art.requires) ? art.requires : [];
    for (const ref of requires.map(String)) {
      if (!idToArtifact.has(ref)) {
        findings.push({
          ruleId: "schema.requires-ref-invalid",
          severity: "error",
          artifactId: id,
          message: `Artifact "${id}" requires unknown artifact "${ref}".`,
        });
      }
    }
  }

  // 3. apply.requires / apply.tracks references.
  for (const art of artifacts) {
    const id = String(art.id ?? "");
    const apply = art.apply;
    if (!apply) continue;

    if (Array.isArray(apply.requires)) {
      for (const ref of apply.requires.map(String)) {
        if (!idToArtifact.has(ref)) {
          findings.push({
            ruleId: "schema.apply-requires-ref-invalid",
            severity: "error",
            artifactId: id,
            message: `Artifact "${id}" apply.requires references unknown artifact "${ref}".`,
          });
        }
      }
    }

    if (apply.tracks != null && String(apply.tracks).trim().length > 0) {
      const tracks = String(apply.tracks).trim();
      if (!matchesGeneratedPath(tracks, artifacts)) {
        findings.push({
          ruleId: "schema.tracks-ref-invalid",
          severity: "error",
          artifactId: id,
          message: `Artifact "${id}" apply.tracks references "${tracks}" which is not produced by any artifact.`,
        });
      }
    }
  }

  // 4. Circular dependency detection (only among valid kebab-case artifacts).
  const cycle = detectCycle(artifacts, idToArtifact);
  if (cycle) {
    findings.push({
      ruleId: "schema.circular-dep",
      severity: "error",
      message: `Circular artifact dependency detected: ${cycle.join(" → ")}.`,
      suggestedFix: "Break the cycle by removing one of the requires edges.",
    });
  }

  // 5. Template declarations: emit a warning so callers know they were not
  //    verified on disk. The on-disk stat is NOT performed here so
  //    `validateSchema` stays a pure, client-safe function; use
  //    `validateSchemaWithBase` for the stat check (server-only).
  for (const art of artifacts) {
    if (art.template && String(art.template).trim().length > 0) {
      const id = String(art.id ?? "");
      findings.push({
        ruleId: "schema.template-missing",
        severity: "error",
        artifactId: id,
        message: `Artifact "${id}" references template file "${art.template}" (not verified on disk without a base dir).`,
        suggestedFix: `Verify the template exists at ${art.template}.`,
      });
    }
  }

  return findings;
}

/** A `tracks` value matches if it equals some artifact's `generates`. */
function matchesGeneratedPath(
  tracks: string,
  artifacts: ParsedArtifact[],
): boolean {
  return artifacts.some((a) => {
    const gen = String(a.generates ?? "");
    if (gen === tracks) return true;
    // Glob support: specs/**/*.md — treat trailing /** as prefix match.
    return globMatches(gen, tracks);
  });
}

/** Minimal glob matcher supporting `**` and `*`. */
function globMatches(pattern: string, candidate: string): boolean {
  if (!pattern.includes("*")) return pattern === candidate;
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "::GLOBSTAR::")
        .replace(/\*/g, "[^/]*")
        .replace(/::GLOBSTAR::/g, ".*") +
      "$",
  );
  return re.test(candidate);
}

/** Topological cycle detection over the requires edges. */
function detectCycle(
  artifacts: ParsedArtifact[],
  idToArtifact: Map<string, ParsedArtifact>,
): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of idToArtifact.keys()) color.set(id, WHITE);

  const stack: string[] = [];

  function visit(id: string): string[] | null {
    color.set(id, GRAY);
    stack.push(id);
    const art = idToArtifact.get(id);
    const requires = Array.isArray(art?.requires) ? art!.requires! : [];
    for (const next of requires.map(String)) {
      if (!idToArtifact.has(next)) continue;
      const c = color.get(next);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(next);
        return [...stack.slice(cycleStart), next];
      }
      if (c === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const id of idToArtifact.keys()) {
    if (color.get(id) === WHITE) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}
