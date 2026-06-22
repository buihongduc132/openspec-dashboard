import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";
import axe, { type ElementContext, type RunOptions } from "axe-core";

// axe helper (NFR-9, task 3.4).
//
// Centralises the axe-core invocation + ruleset loading so every per-component
// a11y test under tests/a11y runs against the SAME ruleset declared in
// axe-a11y.config.json (single source of truth). This mirrors the pattern used
// by the k6 (3.2) and index-freshness (3.3) plumbing where a JSON config is
// the authoritative threshold source and the runtime script reads it.
//
// Usage in a per-component test:
//
//   import { assertNoAxeViolations } from "./axe";
//   it("has no axe violations", async () => {
//     const { container } = render(<MyComponent />);
//     await assertNoAxeViolations(container);
//   });

const CONFIG_PATH = resolve(__dirname, "..", "..", "axe-a11y.config.json");

interface AxeA11yConfig {
  runOptions?: RunOptions;
}

function loadRunOptions(): RunOptions {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AxeA11yConfig;
  // Default to the WCAG 2.1 AA + 2.2 AA tag set if the config omits runOptions.
  return (
    raw.runOptions ?? {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    }
  );
}

/**
 * Run axe-core against a rendered container and fail the test on ANY
 * violation. Per the spec ("SHALL fail on WCAG 2.1 AA + 2.2 AA violations"),
 * violations are a failing (not warning) level — a non-zero violation count
 * throws via `expect`, failing the unit-test job.
 *
 * Returns the full axe result so callers may assert on specific passes when
 * documenting SC coverage (e.g. 2.5.7 Dragging Movements).
 */
export async function runAxe(
  context: ElementContext,
  overrides: RunOptions = {},
) {
  const options = { ...loadRunOptions(), ...overrides };
  const result = await axe.run(context, options);
  return result;
}

/**
 * Assert a rendered container has zero axe violations. The single source of
 * truth for the failing assertion shape used by the NFR-9 structural gate
 * test. Any violation fails the test with a readable summary identifying the
 * component surface and the SC violated.
 */
export async function assertNoAxeViolations(
  context: ElementContext,
  label?: string,
) {
  const result = await runAxe(context);
  const where = label ? ` (${label})` : "";
  expect(
    result.violations,
    `axe found ${result.violations.length} a11y violation(s)${where}: ${JSON.stringify(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        tags: v.tags,
        help: v.help,
      })),
      null,
      2,
    )}`,
  ).toEqual([]);
  return result;
}
