/**
 * Task 4.2 — Change richness library (req 03.11, 03.12, 03.14–03.16).
 *
 * Pure, framework-agnostic behavioral core for the rich change model:
 *   - artifact dependency graph visualization (03.11),
 *   - custom artifact support (03.12),
 *   - bulk archive ordering with inter-change conflict detection (03.14),
 *   - change sync (no archive) with idempotent re-sync + unsync (03.15),
 *   - archive browsing + restore (03.16).
 *
 * Route/UI layers compose these helpers with the filesystem projection,
 * audit chain, git, and the existing single-archive engine
 * (`src/lib/changes/archive.ts` — inverse-patch, restore gate, mutex).
 */
export * from "./types";
export * from "./graph";
export * from "./bulk-archive";
export * from "./sync";
export * from "./archive";
export * from "./file-conflict";
