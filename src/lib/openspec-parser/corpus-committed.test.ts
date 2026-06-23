/**
 * Task 3.6 — corpus committed under `tests/fixtures/openspec/` (NFR-4 gate).
 *
 * Confirmation/gate test: the fixture corpus MUST be committed at the canonical
 * `tests/fixtures/openspec/` location (not only under src/__fixtures__) and
 * every fixture MUST parse without throwing. This guards against accidental
 * removal of the corpus that the byte-fidelity + property suite depends on.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseSpec, serializeSpec } from "@/lib/openspec-parser/spec";

const corpusDir = path.resolve(__dirname, "../../../tests/fixtures/openspec");

describe("task 3.6 — corpus committed under tests/fixtures/openspec", () => {
  it("the canonical corpus directory exists", () => {
    expect(existsSync(corpusDir)).toBe(true);
  });

  it("the corpus contains the expected fixture files", () => {
    const files = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));
    expect(files.sort()).toEqual(["delta-spec.md", "main-spec.md", "tasks.md"]);
  });

  it("every fixture parses and round-trips byte-for-byte when unedited", () => {
    const files = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(path.join(corpusDir, file), "utf8");
      const { model } = parseSpec(content, file);
      // Unedited round-trip MUST reproduce the input bytes exactly (NFR-4).
      expect(serializeSpec(model)).toBe(content);
    }
  });
});
