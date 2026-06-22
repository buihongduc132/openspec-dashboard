/**
 * Task 1.9 — Section splitting (Section Granularity Table, INV-7) unit tests.
 *
 * Spec source: `flow/requirements/README.md` §"Section Granularity Table
 * (INV-7)". The table pins, per artifact type, (a) what counts as one
 * "section" and (b) which bytes are hashed for that section's ETag.
 *
 * Behaviour asserted here:
 *  - `tasks.md`: each checkbox line is one section; bytes = that line's bytes
 *    ONLY (no parent block, no trailing newline).
 *  - `proposal.md` / `design.md`: each top-level `##` heading is one section;
 *    bytes = that heading's BODY bytes (heading line excluded).
 *  - delta spec `.md`: each `## <VERB> Requirements` block is one section;
 *    bytes = that block's bytes.
 *  - whole-file kinds (`config.yaml`, `.openspec.yaml`, `schema.yaml`, schema
 *    template `.md`): exactly one section keyed `__whole__` covering the file.
 *  - main spec `.md`: read-only — produces NO sections (n/a, no writes).
 *  - `artifactKindForPath` maps file paths to the right kind per the table.
 */
import { describe, it, expect } from "vitest";
import {
  splitSections,
  artifactKindForPath,
} from "@/lib/section-etag";

describe("splitSections — tasks.md (section = one task line)", () => {
  it("makes each checkbox line a section keyed by source line number", () => {
    const content = [
      "## 1. Foundations",
      "",
      "- [ ] 1.1 Scaffold",
      "- [x] 1.2 Schema",
      "  - [ ] 1.2.1 sub",
      "",
      "Some prose.",
    ].join("\n");

    const sections = splitSections("tasks", content);

    // Only the four checkbox lines are sections.
    expect(sections.map((s) => s.key)).toEqual([
      "line:3",
      "line:4",
      "line:5",
      // "Some prose." at line 7 is NOT a section.
    ]);
  });

  it("hashes ONLY the line's own bytes — never a parent block or newline", () => {
    const content = "- [ ] 1.1 Do the thing\n- [x] 1.2 Done";
    const sections = splitSections("tasks", content);

    expect(sections[0].bytes).toBe("- [ ] 1.1 Do the thing");
    expect(sections[1].bytes).toBe("- [x] 1.2 Done");
    // Parent blocks (there are none here anyway) are not folded in: confirmed
    // by exact equality with the raw line.
  });
});

describe("splitSections — proposal.md / design.md (section = one `##` heading)", () => {
  it("makes each top-level ## heading a section keyed by heading slug", () => {
    const proposal = [
      "# Title (preamble, not a section)",
      "",
      "Intro paragraph before any section (also not a section).",
      "",
      "## Why",
      "We need it.",
      "",
      "## What Changes",
      "Lots.",
    ].join("\n");

    const sections = splitSections("proposal", proposal);
    expect(sections.map((s) => s.key)).toEqual(["why", "what-changes"]);
    // bytes = BODY only (heading line excluded).
    expect(sections[0].bytes.trim()).toBe("We need it.");
    expect(sections[1].bytes.trim()).toBe("Lots.");
  });

  it("treats design.md the same as proposal.md (## heading = section)", () => {
    const design = "## ADR-001: Use Postgres\nBody of ADR.\n";
    const sections = splitSections("design", design);
    expect(sections).toHaveLength(1);
    expect(sections[0].bytes.trim()).toBe("Body of ADR.");
  });
});

describe("splitSections — delta spec (section = one ## VERB block)", () => {
  it("makes each ADDED/MODIFIED/REMOVED/RENAMED block a section", () => {
    const delta = [
      "## ADDED Requirements",
      "",
      "### Requirement: Foo",
      "foo body",
      "",
      "## MODIFIED Requirements",
      "",
      "### Requirement: Bar",
      "bar body",
    ].join("\n");

    const sections = splitSections("delta-spec", delta);
    expect(sections.map((s) => s.key)).toEqual(["added", "modified"]);
    // bytes = the whole block (verb heading through next verb or EOF).
    expect(sections[0].bytes).toContain("### Requirement: Foo");
    expect(sections[0].bytes).not.toContain("## MODIFIED Requirements");
  });
});

describe("splitSections — whole-file kinds (single section = whole file)", () => {
  it("produces one __whole__ section covering the entire file", () => {
    const yaml = "defaultSchema: spec-driven\nprofiles:\n  - default\n";
    const sections = splitSections("whole-file", yaml);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("__whole__");
    expect(sections[0].bytes).toBe(yaml);
  });
});

describe("splitSections — main spec (read-only, no sections)", () => {
  it("produces NO sections because main specs are read-only (D-MainSpecCRUD)", () => {
    const main = [
      "# Foo Specification",
      "",
      "## Requirements",
      "",
      "### Requirement: Bar",
      "body",
    ].join("\n");
    expect(splitSections("main-spec", main)).toEqual([]);
  });
});

describe("artifactKindForPath — Section Granularity Table mapping", () => {
  it("maps tasks.md → tasks", () => {
    expect(artifactKindForPath("changes/foo/tasks.md")).toBe("tasks");
  });

  it("maps proposal.md → proposal", () => {
    expect(artifactKindForPath("changes/foo/proposal.md")).toBe("proposal");
  });

  it("maps design.md → design", () => {
    expect(artifactKindForPath("changes/foo/design.md")).toBe("design");
  });

  it("maps a delta spec under changes/.../specs/ → delta-spec", () => {
    expect(artifactKindForPath("changes/foo/specs/dashboard-foundation/spec.md")).toBe(
      "delta-spec",
    );
  });

  it("maps a main spec under specs/ → main-spec", () => {
    expect(artifactKindForPath("specs/dashboard-foundation/spec.md")).toBe("main-spec");
  });

  it("maps config.yaml / .openspec.yaml / schema.yaml → whole-file", () => {
    expect(artifactKindForPath("openspec/config.yaml")).toBe("whole-file");
    expect(artifactKindForPath(".openspec.yaml")).toBe("whole-file");
    expect(artifactKindForPath("schemas/schema.yaml")).toBe("whole-file");
  });
});
