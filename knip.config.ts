import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // Next.js App Router entry points
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/app/**/route.ts",
    // shadcn/ui component library (designed for external reuse)
    "src/components/ui/**/*.{ts,tsx}",
    // Database schema exports (task 3.2: whitelist as entry points)
    "src/db/schema.ts",
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
    "src/app/projects/[id]/kanban/_kanban-board.tsx",
    "src/app/projects/[id]/settings/_settings-form.tsx",
  ],
  ignoreDependencies: [
    // Radix UI: installed for shadcn/ui components not yet generated/integrated.
    // Will be consumed as UI components are added in future phases.
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-label",
    "@radix-ui/react-progress",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-select",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@radix-ui/react-tooltip",
    "react-markdown",
    // Dev deps used via CLI or config, not directly imported:
    "drizzle-kit", // CLI tool: npx drizzle-kit generate/push/migrate
    "tailwindcss", // Used via PostCSS config (postcss.config.mjs)
    "testcontainers", // Peer dep of @testcontainers/postgresql
    "@testing-library/jest-dom", // For future component tests
    "@testing-library/react", // For future component tests
  ],
  ignoreBinaries: [],
};

export default config;
