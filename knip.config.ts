import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // Next.js App Router entry points
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/app/**/route.ts",
    // shadcn/ui component library (designed for external reuse)
    "src/components/ui/**/*.{ts,tsx}",
    // Test entry points (so knip sees devDependency imports from test files)
    "src/**/*.test.{ts,tsx}",
    "tests/**/*.test.{ts,tsx}",
    "tests/**/setup.ts",
    "tests/**/helpers.ts",
    "tests/**/global-setup.ts",
  ],
  project: ["src/**/*.{ts,tsx}", "!src/**/*.test.{ts,tsx}"],
  ignore: [
    // Seed data is consumed by scripts, not imported
    "src/db/seed.ts",
    // Pre-existing dead code — not imported by any current entry point.
    // Will be integrated or removed in future phases.
    "src/app/kanban/_global-kanban.tsx",
    "src/app/projects/[id]/settings/_settings-form.tsx",
    // Barrel index files for future API surface consumption
    "src/lib/agent-api/index.ts",
    "src/lib/change-richness/index.ts",
    "src/lib/tasks-richness/index.ts",
    "src/lib/verification/index.ts",
    "src/lib/webhooks/index.ts",
  ],
  ignoreDependencies: [
    // Radix UI: installed for shadcn/ui components not yet generated/integrated.
    // Will be consumed as UI components are added in future phases.
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-dialog",
    "@radix-ui/react-label",
    "@radix-ui/react-progress",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-select",
    "@radix-ui/react-switch",
    "@radix-ui/react-tooltip",
    "react-markdown",
    // Dev deps used via CLI or config, not directly imported:
    "drizzle-kit", // CLI tool: npx drizzle-kit generate/push/migrate
    "tailwindcss", // Used via PostCSS config (postcss.config.mjs)
    "testcontainers", // Peer dep of @testcontainers/postgresql
    "@testing-library/jest-dom", // For future component tests
    "axe-core", // Used via CI a11y workflow, not directly imported
  ],
  ignoreBinaries: [],
};

export default config;
