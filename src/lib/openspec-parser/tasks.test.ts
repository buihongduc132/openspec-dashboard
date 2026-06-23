/**
 * Task 3.4 — tasks.md checkbox parser tests (INV-2: verbatim marker preservation).
 *
 * RED phase: these tests import `@/lib/openspec-parser/tasks` which does not
 * exist yet, so they fail for the right reason (module missing). They assert:
 *  - group headings are captured
 *  - verbatim checkbox marker bytes (`[ ]`, `[x]`, `[X]`) are preserved as-written
 *  - verbatim label bytes are preserved (not normalized/trimmed in a lossy way)
 *  - checked vs unchecked is distinguishable; the display number is metadata only
 *  - byte-fidelity round-trip when unedited (NFR-4)
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`,
 * Requirement "tasks.md checkbox parser".
 */
import { describe, it, expect } from "vitest";
import {
  parseTasks,
  serializeTasks,
  type TasksModel,
} from "@/lib/openspec-parser/tasks";

const CORPUS = `## 1. MFA scaffolding

- [ ] 1.1 Generate TOTP secret on enrollment
- [x] 1.2 Add \`mfaEnrolled\` flag to user record
- [X] 1.3 Verify TOTP on login when enrolled
  - [ ] 1.3a Rate-limit failed TOTP attempts
  - [x] 1.3b Return 401 on invalid TOTP

## 2. Token rename

- [x] 2.1 Rename \`Session Token\` requirement to \`Auth Token\` in specs
`;

describe("task 3.4 — tasks.md group + checkbox parsing", () => {
  it("captures group headings in source order", () => {
    const { model, issues } = parseTasks(CORPUS, "tasks.md");
    expect(issues).toEqual([]);
    expect(model.groups.map((g) => g.heading)).toEqual([
      "1. MFA scaffolding",
      "2. Token rename",
    ]);
  });

  it("assigns task items to their group", () => {
    const { model } = parseTasks(CORPUS, "tasks.md");
    expect(model.groups[0].items).toHaveLength(3);
    expect(model.groups[1].items).toHaveLength(1);
  });

  it("preserves the verbatim checkbox marker bytes per task", () => {
    const { model } = parseTasks(CORPUS, "tasks.md");
    const g0 = model.groups[0].items;
    expect(g0[0].marker).toBe("[ ]");
    expect(g0[1].marker).toBe("[x]");
    expect(g0[2].marker).toBe("[X]");
  });

  it("records checked vs unchecked derived from the marker", () => {
    const { model } = parseTasks(CORPUS, "tasks.md");
    const g0 = model.groups[0].items;
    expect(g0[0].checked).toBe(false);
    expect(g0[1].checked).toBe(true);
    expect(g0[2].checked).toBe(true);
  });

  it("nests sub-items under their parent task", () => {
    const { model } = parseTasks(CORPUS, "tasks.md");
    const parent = model.groups[0].items[2];
    expect(parent.children).toHaveLength(2);
    expect(parent.children[0].marker).toBe("[ ]");
    expect(parent.children[1].marker).toBe("[x]");
  });

  it("preserves the verbatim label bytes (no normalization)", () => {
    const { model } = parseTasks(CORPUS, "tasks.md");
    const item = model.groups[0].items[1];
    expect(item.label).toBe("1.2 Add `mfaEnrolled` flag to user record");
  });

  it("treats the display number as display-only metadata, not identity", () => {
    const { model } = parseTasks(CORPUS, "tasks.md");
    const item = model.groups[0].items[0];
    expect(item.displayNumber).toBe("1.1");
    expect(item.body).toBe("Generate TOTP secret on enrollment");
  });
});

describe("task 3.4 — tasks.md byte-fidelity round-trip (NFR-4 / INV-2)", () => {
  it("serialize reproduces the input bytes exactly when unedited", () => {
    const { model } = parseTasks(CORPUS, "tasks.md");
    expect(serializeTasks(model)).toBe(CORPUS);
  });

  it("parse → serialize → re-parse yields a structurally equal model", () => {
    const { model: first } = parseTasks(CORPUS, "tasks.md");
    const round = serializeTasks(first);
    const { model: second } = parseTasks(round, "tasks.md");
    expect(second.groups.length).toBe(first.groups.length);
    expect(second.groups[0].items[1].marker).toBe(first.groups[0].items[1].marker);
    expect(second.groups[0].items[1].label).toBe(first.groups[0].items[1].label);
  });

  it("does not crash on an empty tasks file", () => {
    const { model, issues } = parseTasks("", "tasks.md");
    expect(model.groups).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("handles a task file with no group heading (loose items)", () => {
    const loose = "- [ ] Do something\n- [x] Do another\n";
    const { model } = parseTasks(loose, "tasks.md");
    // Items without a preceding group heading land in an implicit/anonymous group.
    const allItems = model.groups.flatMap((g) => g.items);
    expect(allItems).toHaveLength(2);
  });
});
