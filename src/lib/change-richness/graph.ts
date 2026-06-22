/**
 * Task 4.2 / req 03.11 + 03.12 — Artifact dependency graph & custom artifacts.
 *
 * Pure graph-layer logic for the change-richness module:
 *   - 03.11: render the schema's artifact dependency DAG as an interactive
 *     graph with a status overlay (done/ready/blocked/invalid) and a
 *     STABLE layout (deterministic positions across reloads — AC a).
 *   - 03.12: fold custom artifacts (beyond the built-in 4) under the
 *     built-ins; each flows through the DAG / validation / archive flow
 *     identically (AC b), and artifacts without a known template render as
 *     plain Markdown (AC a — null template).
 *
 * Determinism: the layered layout assigns a `column` = longest-path-distance
 * from any source, and a `row` = lexicographic rank within the column. Both
 * are pure functions of the (artifact types, edges) set, so the same schema
 * always reproduces the same coordinates regardless of input ordering or
 * reload — satisfying 03.11 AC (a).
 *
 * Route/UI layers compose these helpers with the filesystem projection +
 * artifact status tracker (src/lib/changes/changes.ts `computeArtifactStatus`).
 */
import {
  BUILTIN_ARTIFACT_TYPES,
  type ArtifactDescriptor,
  type ArtifactEdge,
  type ArtifactGraph,
  type ArtifactNode,
  type ArtifactPosition,
  type GraphNodeStatus,
  type SchemaArtifactDag,
} from "@/lib/change-richness/types";

/**
 * Merge the schema's custom artifacts with the built-in artifact set
 * (req 03.12). Built-ins always appear; custom artifacts are appended (after
 * the built-ins) so a project using a custom schema sees both. Duplicate
 * types collapse to the first declaration. Each custom artifact keeps its
 * declared template (null → plain Markdown editor, AC a).
 */
export function mergeArtifacts(
  builtins: ArtifactDescriptor[],
  custom: ArtifactDescriptor[],
): ArtifactDescriptor[] {
  const seen = new Set<string>();
  const out: ArtifactDescriptor[] = [];
  for (const a of [...builtins, ...custom]) {
    if (seen.has(a.type)) continue;
    seen.add(a.type);
    out.push(a);
  }
  return out;
}

/**
 * Compute a deterministic layered layout for the artifact DAG (req 03.11
 * AC a). `column` is the longest-path distance from any source node (so a
 * predecessor on every incoming edge has a strictly smaller column); `row`
 * is the artifact type's lexicographic rank within its column (stable
 * tie-break). The result is a pure function of (types, edges), so it is
 * identical across reloads regardless of input order.
 */
export function layoutArtifactGraph(
  artifacts: ArtifactDescriptor[],
  edges: ArtifactEdge[],
): ArtifactPosition[] {
  const types = artifacts.map((a) => a.type);
  const typeSet = new Set(types);

  // Adjacency: predecessor → successors.
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const t of types) {
    succ.set(t, []);
    indeg.set(t, 0);
  }
  for (const e of edges) {
    // Ignore edges that reference unknown artifact types (defensive).
    if (!typeSet.has(e.from) || !typeSet.has(e.to)) continue;
    succ.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  // Longest-path layering: column = max(column(predecessors)) + 1, sources = 0.
  // Process in topological order (Kahn's algorithm). Cycles in the schema DAG
  // are treated as broken by ignoring back-edges — a schema DAG cycle is a
  // schema authoring error, surfaced elsewhere; the layout still terminates.
  const column = new Map<string, number>();
  const inQ = types.filter((t) => (indeg.get(t) ?? 0) === 0);
  for (const t of inQ) column.set(t, 0);
  const remaining = new Map(indeg);
  const queue = [...inQ];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of succ.get(u) ?? []) {
      remaining.set(v, (remaining.get(v) ?? 0) - 1);
      column.set(v, Math.max(column.get(v) ?? 0, (column.get(u) ?? 0) + 1));
      if ((remaining.get(v) ?? 0) === 0) queue.push(v);
    }
  }
  // Any node still without a column (inside a cycle) defaults to 0.
  for (const t of types) if (!column.has(t)) column.set(t, 0);

  // Row within column: lexicographic by type (stable tie-break).
  const byCol = new Map<number, string[]>();
  for (const t of types) {
    const c = column.get(t)!;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c)!.push(t);
  }
  const positions: ArtifactPosition[] = [];
  for (const [c, ts] of byCol) {
    ts.sort((a, b) => a.localeCompare(b));
    ts.forEach((t, row) => positions.push({ type: t, column: c, row }));
  }
  return positions;
}

/**
 * Build the full artifact graph view: nodes (with status overlay) + edges +
 * deterministic positions (req 03.11). `statusByType` maps artifact type →
 * computed status (from `computeArtifactStatus`); `presentByType` is unused
 * here but reserved for future click-through routing (AC b opens the editor).
 */
export function buildArtifactGraph(
  schema: SchemaArtifactDag,
  statusByType: Map<string, GraphNodeStatus>,
  _presentByType: Map<string, boolean>,
): ArtifactGraph {
  const nodes: ArtifactNode[] = schema.artifacts.map((artifact) => ({
    artifact,
    status: statusByType.get(artifact.type) ?? "ready",
  }));
  const positions = layoutArtifactGraph(schema.artifacts, schema.edges);
  return { nodes, edges: schema.edges, positions };
}

/**
 * Describe the default `spec-driven` schema DAG (built-ins only). Used as the
 * fallback when a project has no custom schema artifacts declared.
 */
export function defaultSpecDrivenDag(): SchemaArtifactDag {
  const builtins: ArtifactDescriptor[] = BUILTIN_ARTIFACT_TYPES.map((type) => ({
    type,
    builtin: true,
    template: null,
  }));
  // Canonical ordering: proposal → design → {specs, tasks}.
  const edges: ArtifactEdge[] = [
    { from: "proposal", to: "design" },
    { from: "design", to: "specs" },
    { from: "design", to: "tasks" },
  ];
  return { artifacts: builtins, edges };
}
