import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // Next.js App Router entry points
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/app/**/route.ts",
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
  ],
  // shadcn/ui components export variants/types by design for external reuse
  ignoreBinaries: [],
};

export default config;

// Baseline-documented exceptions (knip --include exports may still flag these;
// they are intentional library exports, not dead code):
//   badgeVariants, buttonVariants, CardFooter, ACCENT_PALETTE,
//   BadgeProps, ButtonProps
