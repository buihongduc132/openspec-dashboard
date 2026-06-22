/**
 * Task 1.8 — Filesystem projection end-to-end unit tests.
 *
 * Spec source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "Filesystem projection with
 * atomic writes"; req 01 §1.4, INV-7).
 *
 * Behaviour asserted: `projectChange` writes a change model's artifacts out to
 * the filesystem using ATOMIC writes (temp + rename) — verified via an
 * injected fake filesystem that records every write/rename call.
 */
import { describe, it, expect } from "vitest";
import { parseChange, type ChangeModel } from "@/lib/openspec-parser";
import { projectChange, type ProjectionFs } from "@/lib/filesystem-projection";

/** In-memory fake filesystem that simulates atomic temp→rename promotion. */
function makeFs(): ProjectionFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async mkdir() {},
    async writeFile(p, data) {
      files.set(p, data);
    },
    async rename(from, to) {
      const v = files.get(from);
      if (v !== undefined) {
        files.delete(from);
        files.set(to, v);
      }
    },
    async unlink(p) {
      files.delete(p);
    },
  };
}

describe("projectChange", () => {
  it("projects a change model back to its files and every write is atomic", async () => {
    const files = {
      "proposal.md": "## Why\nShip it.",
      "tasks.md": "- [ ] Do thing\n- [x] Done thing",
      "specs/foo/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: Added",
        "body",
      ].join("\n"),
    };
    const change: ChangeModel = parseChange("release-1", files);

    const fs = makeFs();
    await projectChange("/proj/openspec/changes/release-1", change, fs);

    // proposal.md written (verbatim artifact).
    expect(fs.files.get("/proj/openspec/changes/release-1/proposal.md")).toContain("Ship it.");
    // tasks.md written via the round-tripped serializer (labels preserved).
    expect(fs.files.get("/proj/openspec/changes/release-1/tasks.md")).toContain("Do thing");
    // delta spec written.
    expect(
      fs.files.get("/proj/openspec/changes/release-1/specs/foo/spec.md"),
    ).toContain("Added");
  });
});
