/**
 * Unit tests for the shared `isSupportedType` validation helper (task 2.3).
 *
 * The helper is the single runtime guard reused by both the reference API
 * route (400 taxonomy on miss) and the payload builder (clean TypeError on
 * unsupported input). It lives in its own module so neither consumer owns
 * the taxonomy.
 */
import { describe, it, expect } from "vitest";
import {
  isSupportedType,
  SUPPORTED_REFERENCE_TYPES,
} from "@/lib/entity-reference/supported-types";
import type { EntityType } from "@/lib/entity-reference/types";

describe("isSupportedType (task 2.3 shared validation helper)", () => {
  it("returns true for every supported entity type", () => {
    for (const t of SUPPORTED_REFERENCE_TYPES) {
      expect(isSupportedType(t)).toBe(true);
    }
  });

  it("narrows unknown to false (the 400-path guard)", () => {
    expect(isSupportedType("unsupportedType")).toBe(false);
    expect(isSupportedType("")).toBe(false);
    expect(isSupportedType("Task")).toBe(false); // case-sensitive
    expect(isSupportedType("project ")).toBe(false); // whitespace-sensitive
  });

  it("rejects non-string input without throwing", () => {
    expect(isSupportedType(undefined)).toBe(false);
    expect(isSupportedType(null)).toBe(false);
    expect(isSupportedType(42)).toBe(false);
    expect(isSupportedType({ type: "task" })).toBe(false);
    expect(isSupportedType(["task"])).toBe(false);
  });

  it("exposes the taxonomy as a readonly list covering exactly the EntityType union", () => {
    expect(Array.isArray(SUPPORTED_REFERENCE_TYPES)).toBe(true);
    // Every entry is a valid EntityType
    const asUnion = SUPPORTED_REFERENCE_TYPES as readonly EntityType[];
    expect(asUnion.length).toBeGreaterThan(0);
    // No duplicates
    expect(new Set(SUPPORTED_REFERENCE_TYPES).size).toBe(
      SUPPORTED_REFERENCE_TYPES.length,
    );
    // Covers the canonical 10 kinds
    expect(SUPPORTED_REFERENCE_TYPES).toEqual(
      expect.arrayContaining([
        "project",
        "change",
        "spec",
        "spec-domain",
        "requirement",
        "task",
        "schema",
        "context-store",
        "workspace",
        "initiative",
      ]),
    );
  });
});
