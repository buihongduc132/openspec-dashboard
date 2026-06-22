/**
 * Task 2.21 — Schema resolution debug (req 05.1, 05.2, 05.9).
 *
 * Schema resolution follows a three-layer precedence: project → user → built-in.
 * The resolver surfaces the full resolution path so users can see which layer
 * served the schema and why.
 *
 * Source: `flow/requirements/05-schemas.md` §5.1, §5.9.
 */

import { describe, expect, it } from "vitest";
import { resolveSchema, type SchemaResolutionResult } from "./resolve";

describe("Schema resolution (req 05.1, 05.9)", () => {
  it("returns a resolution result with all layers", () => {
    const candidates = {
      project: { name: "custom", version: "1.0", path: "/project/schemas/custom" },
      user: null,
      builtin: { name: "custom", version: "0.5", path: "/builtin/schemas/custom" },
    };

    const result = resolveSchema("custom", candidates);
    expect(result).toBeDefined();
    expect(result.name).toBe("custom");
    expect(result.servedBy).toBe("project");
  });

  it("falls back to user layer when project layer misses", () => {
    const candidates = {
      project: null,
      user: { name: "custom", version: "1.0", path: "/user/schemas/custom" },
      builtin: { name: "custom", version: "0.5", path: "/builtin/schemas/custom" },
    };

    const result = resolveSchema("custom", candidates);
    expect(result.servedBy).toBe("user");
    expect(result.version).toBe("1.0");
  });

  it("falls back to built-in layer when project and user miss", () => {
    const candidates = {
      project: null,
      user: null,
      builtin: { name: "spec-driven", version: "1.0", path: "/builtin/schemas/spec-driven" },
    };

    const result = resolveSchema("spec-driven", candidates);
    expect(result.servedBy).toBe("builtin");
  });

  it("returns not-found when all layers miss", () => {
    const candidates = {
      project: null,
      user: null,
      builtin: null,
    };

    const result = resolveSchema("missing", candidates);
    expect(result.servedBy).toBeNull();
    expect(result.found).toBe(false);
  });

  it("includes full resolution log in result", () => {
    const candidates = {
      project: { name: "custom", version: "1.0", path: "/project/schemas/custom" },
      user: { name: "custom", version: "0.8", path: "/user/schemas/custom" },
      builtin: { name: "custom", version: "0.5", path: "/builtin/schemas/custom" },
    };

    const result = resolveSchema("custom", candidates);
    expect(result.resolutionLog).toBeDefined();
    expect(result.resolutionLog.length).toBe(3);
    expect(result.resolutionLog[0].layer).toBe("project");
    expect(result.resolutionLog[0].hit).toBe(true);
    expect(result.resolutionLog[1].layer).toBe("user");
    expect(result.resolutionLog[1].hit).toBe(true);
    expect(result.resolutionLog[2].layer).toBe("builtin");
    expect(result.resolutionLog[2].hit).toBe(true);
  });

  it("provides diagnostic when schema not found", () => {
    const candidates = {
      project: null,
      user: null,
      builtin: null,
    };

    const result = resolveSchema("typo-schema", candidates);
    expect(result.diagnostic).toBeDefined();
    expect(result.diagnostic).toContain("not found");
  });

  it("includes version in resolution result", () => {
    const candidates = {
      project: { name: "test", version: "2.3.1", path: "/project/schemas/test" },
      user: null,
      builtin: null,
    };

    const result = resolveSchema("test", candidates);
    expect(result.version).toBe("2.3.1");
  });
});
