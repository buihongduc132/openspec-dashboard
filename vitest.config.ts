import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const sharedResolve = {
  alias: { "@": path.resolve(__dirname, "./src") },
};

export default defineConfig({
  plugins: [react()],
  resolve: sharedResolve,
  test: {
    coverage: { provider: "v8" },
    projects: [
      {
        resolve: sharedResolve,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
              "src/**/*.test.{ts,tsx}",
              "src/**/*.d.ts",
              "src/db/seed.ts",
              "src/db/index.ts",
            ],
            thresholds: { lines: 80 },
          },
        },
      } as any,
      {
        resolve: sharedResolve,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
              "src/**/*.test.{ts,tsx}",
              "src/**/*.d.ts",
              "src/db/seed.ts",
              "src/db/index.ts",
            ],
            thresholds: { lines: 40 },
          },
        },
      } as any,
    ],
  },
});
