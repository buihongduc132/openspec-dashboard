/**
 * Task 4.2 — Artifact dependency graph (req 03.11) + custom artifacts (03.12).
 *
 * Tests for the pure graph-layer logic:
 *   - 03.11 AC (a): graph layout is stable (deterministic positions) across
 *     reloads; topological columns + lexicographic rows reproduce the same
 *     coordinates regardless of input order.
 *   - 03.12 AC (a/b): custom artifacts beyond the built-in 4 render as plain
 *     Markdown nodes and flow through the DAG / validation identically.
 */
import { describe, it, expect } from "vitest";
import {
  buildArtifactGraph,
  mergeArtifacts,
} from "@/lib/change-richness/graph";
import {
  BUILTIN_ARTIFACT_TYPES,
  type ArtifactDescriptor,
  type GraphNodeStatus,
  type SchemaArtifactDag,
} from "@/lib/change-richness/types";

function statusMap(entries: Array<[string, GraphNodeStatus]>): Map<string, GraphNodeStatus> {
  return new Map(entries);
}

function desc(type: string, template: string | null = null): ArtifactDescriptor {
  const builtin = (BUILTIN_ARTIFACT_TYPES as readonly string[]).includes(type);
  return { type, builtin, template };
}

function dag(
  artifacts: ArtifactDescriptor[],
  edges: { from: string; to: string }[] = [],
): SchemaArtifactDag {
  return { artifacts, edges };
}

describe("Task 4.2 / req 03.11 — Artifact dependency graph layout", () => {
  it("assigns topological columns so an edge predecessor has a lower column", () => {
    const schema = dag(
      [desc("proposal"), desc("design"), desc("specs"), desc("tasks")],
      [
        { from: "proposal", to: "design" },
        { from: "design", to: "specs" },
        { from: "design", to: "tasks" },
      ],
    );
    const g = buildArtifactGraph(schema, new Map(), new Map());
    const col = (t: string) =>
      g.positions.find((p) => p.type === t)!.column;
    expect(col("proposal")).toBeLessThan(col("design"));
    expect(col("design")).toBeLessThan(col("specs"));
    expect(col("design")).toBeLessThan(col("tasks"));
  });

  it("layout is deterministic across input reorderings (03.11 AC a)", () => {
    const a = buildArtifactGraph(
      dag(
        [desc("proposal"), desc("design"), desc("specs")],
        [{ from: "proposal", to: "design" }],
      ),
      statusMap([
        ["proposal", "done"],
        ["design", "done"],
      ]),
      new Map(),
    );
    const b = buildArtifactGraph(
      dag(
        [desc("design"), desc("proposal"), desc("specs")],
        [{ from: "proposal", to: "design" }],
      ),
      statusMap([
        ["proposal", "done"],
        ["design", "done"],
      ]),
      new Map(),
    );
    // Sort by type for a stable comparison key.
    const norm = (g: typeof a) =>
      [...g.positions]
        .sort((x, y) => x.type.localeCompare(y.type))
        .map((p) => `${p.type}:${p.column},${p.row}`)
        .join("|");
    expect(norm(b)).toEqual(norm(a));
  });

  it("rows within a column are tie-broken lexicographically by artifact type", () => {
    // specs + tasks both depend on design → same column; lex tie-break.
    const g = buildArtifactGraph(
      dag(
        [desc("tasks"), desc("specs")],
        [
          { from: "design", to: "specs" },
          { from: "design", to: "tasks" },
        ],
      ),
      new Map(),
      new Map(),
    );
    const rowOf = (t: string) => g.positions.find((p) => p.type === t)!.row;
    expect(rowOf("specs")).toBeLessThan(rowOf("tasks"));
  });

  it("overlays the status colors onto nodes from the change's artifact table", () => {
    const g = buildArtifactGraph(
      dag([desc("proposal"), desc("design")]),
      statusMap([
        ["proposal", "done"],
        ["design", "blocked"],
      ]),
      new Map(),
    );
    const statusOf = (t: string) =>
      g.nodes.find((n) => n.artifact.type === t)!.status;
    expect(statusOf("proposal")).toBe("done");
    expect(statusOf("design")).toBe("blocked");
  });
});

describe("Task 4.2 / req 03.12 — Custom artifact support", () => {
  it("mergeArtifacts folds custom schema artifacts under the built-ins", () => {
    const merged = mergeArtifacts(
      [desc("proposal"), desc("design"), desc("tasks")],
      [desc("api-spec", "# API Spec\n...")],
    );
    const types = merged.map((a) => a.type);
    expect(types).toContain("proposal");
    expect(types).toContain("api-spec");
    expect(merged.find((a) => a.type === "api-spec")!.builtin).toBe(false);
  });

  it("a custom artifact without a template renders as plain Markdown (null template)", () => {
    const merged = mergeArtifacts([desc("proposal")], [desc("notes", null)]);
    const notes = merged.find((a) => a.type === "notes")!;
    expect(notes.template).toBeNull();
    expect(notes.builtin).toBe(false);
  });

  it("custom artifacts appear in the DAG identically to built-ins", () => {
    const g = buildArtifactGraph(
      dag(
        [desc("proposal"), desc("api-spec", null), desc("tasks")],
        [{ from: "proposal", to: "api-spec" }],
      ),
      new Map(),
      new Map(),
    );
    expect(g.nodes.some((n) => n.artifact.type === "api-spec")).toBe(true);
    expect(
      g.positions.find((p) => p.type === "api-spec"),
    ).toBeDefined();
  });
});
