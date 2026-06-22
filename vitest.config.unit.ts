import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Unit test configuration — jsdom environment for component/unit tests.
//
// Coverage:
//   Reporter: text + json-summary (produces coverage/unit/coverage-summary.json)
//   Scope: src TypeScript/TSX files, excluding tests, .d.ts, seed, db internals
//   Threshold baseline: 0% (infrastructure gate — verifies instrumentation ON)
//   Target: lines > 80% (raise threshold as unit test coverage grows)
//
// Why split from vitest.config.integration.ts:
//   Vitest does not support per-project coverage configuration. Coverage is a
//   root-only option. Splitting into separate config files gives each test type
//   its own threshold, reporter, and reportsDirectory.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    name: "unit",
    environment: "jsdom",
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      // Per-component axe-core a11y tests (NFR-9, task 3.4).
      "tests/a11y/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage/unit",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/db/seed.ts",
        "src/db/index.ts",
      ],
      thresholds: {
        lines: 0, // Baseline — raise to 80 as coverage grows
      },
    },
  },
});
