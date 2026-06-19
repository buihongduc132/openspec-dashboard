import { defineConfig } from "vitest/config";
import path from "path";

// Integration test configuration — node environment with real Postgres testcontainer.
//
// Coverage:
//   Reporter: text + json-summary (produces coverage/integration/coverage-summary.json)
//   Scope: src TypeScript/TSX files, excluding tests, .d.ts, seed, db internals
//   Threshold baseline: 0% (infrastructure gate — verifies instrumentation ON)
//   Target: lines > 40% (raise threshold as integration coverage grows)
//
// globalSetup: starts the Postgres testcontainer and sets process.env.DATABASE_URL
// BEFORE any test file imports are evaluated. This fixes the race condition where
// src/db/index.ts reads DATABASE_URL eagerly at module-evaluation time but the
// old setup.ts only set it in beforeAll (post-import).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.{ts,tsx}"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage/integration",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/db/seed.ts",
        "src/db/index.ts",
      ],
      thresholds: {
        lines: 0, // Baseline — raise to 40 as coverage grows
      },
    },
  },
});
