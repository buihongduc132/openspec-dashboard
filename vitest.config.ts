import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Default vitest config — re-exports the unit test configuration.
// For unit tests:     vitest run --config vitest.config.unit.ts
// For integration:    vitest run --config vitest.config.integration.ts
// This file provides IDE auto-discovery (VSCode Vitest extension, etc.)
// and defaults to the unit config when no --config flag is passed.
const sharedResolve = {
  alias: { "@": path.resolve(__dirname, "./src") },
};

export default defineConfig({
  plugins: [react()],
  resolve: sharedResolve,
  test: {
    name: "unit",
    environment: "jsdom",
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      // Per-component axe-core a11y tests (NFR-9, task 3.4).
      "tests/a11y/**/*.test.{ts,tsx}",
    ],
  },
});
