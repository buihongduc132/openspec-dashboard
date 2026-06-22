/**
 * Task 4.1 — Task richness library (req 04 §4.7–4.10, 4.12–4.20, 4.23).
 *
 * Pure, framework-agnostic behavioral core for the rich task model:
 * swimlanes, composable filters, full-text search, dependency graph
 * (cycle detection + done-guard), sub-checklist / progress / due-date
 * helpers, and atomic-per-change bulk operations. These power the kanban,
 * list, and calendar views (§4.18–4.19) and the bulk-ops surface (§4.23).
 *
 * UI routes compose these helpers over a `RichTask[]` projection of the
 * Markdown tasks.md + sidecar identity layer (see {@link SidecarTaskEntry}).
 */
export * from "./types";
export * from "./swimlanes";
export * from "./filters";
export * from "./search";
export * from "./dependencies";
export * from "./progress";
export * from "./bulk";
