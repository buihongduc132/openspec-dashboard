import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // Next.js App Router entry points
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/app/**/route.ts",
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
