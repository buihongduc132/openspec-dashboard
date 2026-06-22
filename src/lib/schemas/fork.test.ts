/**
 * Task 4.5 — Schema authoring: forking (req 05 §5.4).
 *
 * Fork provenance is a DASHBOARD-SIDE metadata field under
 * `openspec/.dashboard/schema-forks.json` (NOT an invented upstream
 * `forked_from` YAML key). Provenance records forked-from name + version +
 * timestamp and enables "diff against upstream".
 *
 *  - 05.4 AC (a): Fork provenance enables "diff against upstream".
 *  - 05.4 AC (b): "Diff against upstream" shows file-level changes.
 */
import { describe, it, expect } from "vitest";
import {
  recordForkProvenance,
  diffAgainstUpstream,
  type SchemaForksManifest,
  type ForkProvenance,
  type SchemaFileSet,
} from "@/lib/schemas/fork";

const upstreamFiles: SchemaFileSet = {
  "schema.yaml": "name: spec-driven\nversion: 1.0.0\n",
  "templates/proposal.md": "# Proposal\n",
  "templates/design.md": "# Design\n",
};

describe("recordForkProvenance (05.4 a)", () => {
  it("appends a provenance entry keyed by fork name without inventing an upstream key", () => {
    const before: SchemaForksManifest = { forks: {} };
    const entry: ForkProvenance = {
      forkedFromName: "spec-driven",
      forkedFromVersion: "1.0.0",
      forkedFromLayer: "builtin",
      forkedAt: "2026-06-22T00:00:00Z",
    };
    const after = recordForkProvenance(before, "custom-flow", entry);
    expect(after.forks["custom-flow"]).toEqual(entry);
    // Original manifest is not mutated.
    expect(before.forks["custom-flow"]).toBeUndefined();
  });

  it("overwrites an existing fork entry on re-fork (same name)", () => {
    const before: SchemaForksManifest = {
      forks: {
        "custom-flow": {
          forkedFromName: "spec-driven",
          forkedFromVersion: "0.9.0",
          forkedFromLayer: "builtin",
          forkedAt: "2026-01-01T00:00:00Z",
        },
      },
    };
    const after = recordForkProvenance(before, "custom-flow", {
      forkedFromName: "spec-driven",
      forkedFromVersion: "1.0.0",
      forkedFromLayer: "builtin",
      forkedAt: "2026-06-22T00:00:00Z",
    });
    expect(after.forks["custom-flow"]!.forkedFromVersion).toBe("1.0.0");
  });
});

describe("diffAgainstUpstream (05.4 b)", () => {
  it("reports added, modified, and removed files at file level", () => {
    const forkFiles: SchemaFileSet = {
      "schema.yaml": "name: custom-flow\nversion: 1.0.0\n", // modified
      "templates/proposal.md": "# Proposal\n", // unchanged
      "templates/tasks.md": "# Tasks\n", // added
      // design.md removed
    };
    const diff = diffAgainstUpstream(forkFiles, upstreamFiles);
    const byPath = new Map(diff.entries.map((e) => [e.path, e]));
    expect(byPath.get("schema.yaml")?.status).toBe("modified");
    expect(byPath.get("templates/proposal.md")?.status).toBe("unchanged");
    expect(byPath.get("templates/tasks.md")?.status).toBe("added");
    expect(byPath.get("templates/design.md")?.status).toBe("removed");
  });

  it("reports overall unchanged when the file sets are identical", () => {
    const diff = diffAgainstUpstream(upstreamFiles, upstreamFiles);
    expect(diff.changedCount).toBe(0);
    expect(diff.entries.every((e) => e.status === "unchanged")).toBe(true);
  });

  it("sorts entries by path for deterministic output", () => {
    const forkFiles: SchemaFileSet = {
      "templates/z.md": "z",
      "templates/a.md": "a",
      "schema.yaml": "x",
    };
    const diff = diffAgainstUpstream(forkFiles, upstreamFiles);
    const paths = diff.entries.map((e) => e.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });
});
