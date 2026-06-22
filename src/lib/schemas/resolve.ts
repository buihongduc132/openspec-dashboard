/**
 * Task 2.21 — Schema resolution + resolution debug (req 05.1, 05.2, 05.9).
 *
 * Schema resolution follows a three-layer precedence:
 *   project (`openspec/schemas/`)
 *     → user (`~/.local/share/openspec/schemas/`)
 *       → built-in
 *
 * The first layer to define a schema with the requested name serves it; lower
 * precedence layers are recorded in the resolution log for debugging
 * ("Why is my fork not being used?").
 *
 * Source: `flow/requirements/05-schemas.md` §5.1 (listing precedence),
 * §5.9 (resolution debug).
 */

/** A single schema candidate found in a resolution layer. */
export interface SchemaCandidate {
  name: string;
  version: string;
  /** Absolute path or identifier the layer served the schema from. */
  path: string;
}

/** The three resolution layers, in precedence order. */
export interface SchemaCandidates {
  /** Project-local layer (`openspec/schemas/`). Highest precedence. */
  project: SchemaCandidate | null;
  /** User-level layer (`~/.local/share/openspec/schemas/`). */
  user: SchemaCandidate | null;
  /** Built-in layer. Lowest precedence. */
  builtin: SchemaCandidate | null;
}

/** One entry in the resolution log — a layer + whether it had the schema. */
export interface ResolutionLogEntry {
  layer: "project" | "user" | "builtin";
  hit: boolean;
  /** The candidate when the layer had the schema; null otherwise. */
  candidate: SchemaCandidate | null;
}

/** The full resolution result for a schema reference (req 05.9). */
export interface SchemaResolutionResult {
  /** The requested schema name. */
  name: string;
  /** Which layer served the schema, or null when not found. */
  servedBy: "project" | "user" | "builtin" | null;
  /** Version of the served schema (or null when not found). */
  version: string | null;
  /** Path/identifier of the served schema (or null when not found). */
  path: string | null;
  /** Whether the schema was found in any layer. */
  found: boolean;
  /** Ordered resolution log (project → user → built-in). */
  resolutionLog: ResolutionLogEntry[];
  /** Human-readable diagnostic for the "Why not my fork?" question. */
  diagnostic: string;
}

/** Layer evaluation order, highest precedence first. */
const LAYER_ORDER = ["project", "user", "builtin"] as const;

/**
 * Resolve a schema reference against the three-layer candidate set.
 *
 * Returns the served schema (highest-precedence layer that has it) plus a
 * full resolution log so callers can render the "resolution debug" view
 * (req 05.9 AC a/b).
 */
export function resolveSchema(
  name: string,
  candidates: SchemaCandidates,
): SchemaResolutionResult {
  const resolutionLog: ResolutionLogEntry[] = LAYER_ORDER.map((layer) => {
    const candidate = candidates[layer];
    return { layer, hit: candidate !== null, candidate };
  });

  const servedLayer = LAYER_ORDER.find((layer) => candidates[layer] !== null);
  const served = servedLayer ? candidates[servedLayer] : null;

  if (!served || !servedLayer) {
    return {
      name,
      servedBy: null,
      version: null,
      path: null,
      found: false,
      resolutionLog,
      diagnostic: buildNotFoundDiagnostic(name, candidates),
    };
  }

  return {
    name,
    servedBy: servedLayer,
    version: served.version,
    path: served.path,
    found: true,
    resolutionLog,
    diagnostic: buildServedDiagnostic(name, servedLayer, candidates),
  };
}

/** Diagnostic for a not-found schema — actionable suggestions (req 05.9 AC b). */
function buildNotFoundDiagnostic(
  name: string,
  candidates: SchemaCandidates,
): string {
  const checked: string[] = [];
  if (candidates.project === null) checked.push("project (`openspec/schemas/`)");
  if (candidates.user === null) checked.push("user (`~/.local/share/openspec/schemas/`)");
  if (candidates.builtin === null) checked.push("built-in");
  return `Schema "${name}" was not found in any layer (checked: ${checked.join(", ")}). ` +
    "Check for typos, confirm the schema is installed in the expected layer, or create it as a project-local schema.";
}

/** Diagnostic explaining why a particular layer served the schema. */
function buildServedDiagnostic(
  name: string,
  servedLayer: "project" | "user" | "builtin",
  _candidates: SchemaCandidates,
): string {
  return `Schema "${name}" is served by the ${servedLayer} layer (highest precedence that defined it).`;
}
