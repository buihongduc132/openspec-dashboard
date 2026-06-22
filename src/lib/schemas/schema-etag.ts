/**
 * Task 6.5 — Whole-file ETag for DB-backed schema definitions (INV-7).
 *
 * Schema files are whole-file single-writer per the Section Granularity Table
 * (the visual-editor spec calls this out explicitly). For a schema whose
 * `definition` lives in the `schemas` table, the whole-file ETag is the
 * SHA-256 of the current definition bytes. A save carries the `If-Match`
 * ETag captured at load time; the server recomputes from the row it is about
 * to overwrite and rejects (409) on mismatch.
 *
 * Source: `openspec/changes/phase3b-integration/specs/schema-visual-editor/spec.md`
 * (Requirement: "Visual editor respects whole-file ETag concurrency").
 */
import { createHash } from "node:crypto";

/** Compute the whole-file ETag for a schema definition. */
export function computeSchemaEtag(definition: string): string {
  return createHash("sha256").update(definition, "utf8").digest("hex");
}
