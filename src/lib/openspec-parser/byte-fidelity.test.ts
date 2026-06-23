/**
 * Task 3.1 — corpus byte-fidelity + property-based tests (NFR-4).
 *
 * RED phase: these tests exercise parse→serialize→parse byte-fidelity over a
 * fixture corpus (`tests/fixtures/openspec/*`) and property-based tests for
 * untouched regions. They import a serializer from `@/lib/openspec-parser/spec`
 * which does not exist yet, so they fail for the right reason (module missing).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseSpec,
  serializeSpec,
  setRequirementBody,
  type SpecModel,
} from "@/lib/openspec-parser/spec";

const corpusDir = path.resolve(__dirname, "../../../tests/fixtures/openspec");

function readCorpus(name: string): string {
  return readFileSync(path.join(corpusDir, name), "utf8");
}

const CORPUS_FILES = ["main-spec.md", "delta-spec.md", "tasks.md"];

// Deep structural equality helper for SpecModel (ignores ephemeral line numbers).
function expectStructurallyEqual(a: SpecModel, b: SpecModel): void {
  expect(b.capability).toBe(a.capability);
  expect(b.requirements.length).toBe(a.requirements.length);
  for (let i = 0; i < a.requirements.length; i++) {
    const ra = a.requirements[i];
    const rb = b.requirements[i];
    expect(rb.name).toBe(ra.name);
    expect(rb.body).toBe(ra.body);
    expect(rb.scenarios.length).toBe(ra.scenarios.length);
    for (let j = 0; j < ra.scenarios.length; j++) {
      expect(rb.scenarios[j].name).toBe(ra.scenarios[j].name);
      expect(rb.scenarios[j].body).toBe(ra.scenarios[j].body);
    }
  }
}

describe("task 3.1 — corpus byte-fidelity (NFR-4)", () => {
  it.each(CORPUS_FILES)(
    "parse → serialize → re-parse yields a structurally equal model for %s",
    (file) => {
      const original = readCorpus(file);
      const { model: first } = parseSpec(original, file);
      const serialized = serializeSpec(first);
      const { model: second } = parseSpec(serialized, file);
      expectStructurallyEqual(first, second);
    },
  );

  it.each(CORPUS_FILES)(
    "untouched regions are byte-identical after parse → serialize for %s",
    (file) => {
      const original = readCorpus(file);
      const { model } = parseSpec(original, file);
      const serialized = serializeSpec(model);
      // No edits applied → entire document must reproduce byte-for-byte.
      expect(serialized).toBe(original);
    },
  );

  it("editing one requirement body leaves every other region byte-identical", () => {
    const original = readCorpus("main-spec.md");
    const { model } = parseSpec(original, "main-spec.md");
    expect(model.requirements.length).toBeGreaterThan(0);
    // Mutate the first requirement's body via the editing API, which rewrites
    // the verbatim line store so non-edited regions stay byte-identical.
    const req0 = model.requirements[0];
    const bodyStart = req0.line; // 1-based header line; body follows
    // The body region is [header+1 .. first scenario header - 1] (0-based: lines
    // strictly between the header and the first nested scenario, or the span end).
    const newBody = "REPLACEMENT BODY — edited region.";
    const editedModel = setRequirementBody(model, 0, newBody);
    const edited = serializeSpec(editedModel);
    // The region BEFORE the edited requirement must be byte-identical.
    const prefix = model.lines.slice(0, req0.span[0]).join("\n");
    expect(edited.startsWith(prefix)).toBe(true);
    // The region AFTER the edited requirement must be byte-identical.
    const suffix = model.lines.slice(req0.span[1]).join("\n");
    expect(edited.endsWith(suffix)).toBe(true);
    // The new body is present, the old body is gone.
    expect(edited).toContain(newBody);
    expect(edited).not.toContain(req0.body.split("\n")[0]);
  });
});

describe("task 3.1 — property-based corpus round-trip (NFR-4)", () => {
  // Deterministic pseudo-random generator (no external dep) so the property
  // test is reproducible.
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function genSpec(rand: () => number): string {
    const reqCount = 1 + Math.floor(rand() * 3);
    const lines: string[] = ["## Purpose", "", "Auto-generated spec.", "", "## Requirements", ""];
    for (let r = 0; r < reqCount; r++) {
      lines.push(`### Requirement: Generated requirement ${r}`);
      lines.push(`The system SHALL do thing ${r}. The system MUST NOT skip it.`);
      const scCount = Math.floor(rand() * 3);
      for (let s = 0; s < scCount; s++) {
        lines.push("");
        lines.push(`#### Scenario: Generated scenario ${r}.${s}`);
        lines.push(`- **WHEN** condition ${r}.${s} holds`);
        lines.push(`- **THEN** the system SHALL respond ${r}.${s}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  it("parse → serialize → parse yields an equal model for 100% of a generated corpus", () => {
    const rand = mulberry32(42);
    const cases = 50;
    for (let i = 0; i < cases; i++) {
      const content = genSpec(rand);
      const { model: first } = parseSpec(content, `gen-${i}.md`);
      const serialized = serializeSpec(first);
      // Property A: untouched round-trip reproduces bytes.
      expect(serialized).toBe(content);
      // Property B: re-parse yields a structurally equal model.
      const { model: second } = parseSpec(serialized, `gen-${i}.md`);
      expectStructurallyEqual(first, second);
    }
  });
});
