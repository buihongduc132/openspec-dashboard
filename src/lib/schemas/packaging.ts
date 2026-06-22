/**
 * Task 4.5 — Schema authoring: export / import (req 05 §5.10).
 *
 * A schema package is a portable bundle of the schema definition + template
 * files plus a manifest carrying schema version + fork provenance
 * (05.10 AC a). The package is the wire format a route layer wraps as a
 * tarball for download; here we keep it as a structured envelope so the
 * behavior (manifest contents, validate-before-write, atomicity,
 * name-collision prompt) is unit-testable without a real tar encoder.
 *
 * Import is validate-then-write, all-or-nothing (05.10 AC b):
 *   - parseSchemaPackage validates the manifest + declared files.
 *   - planSchemaImport validates the schema definition, detects name
 *     collisions, and only emits a write plan when everything is clean.
 *
 * Source: `flow/requirements/05-schemas.md` §5.10.
 */
import { validateSchema, type SchemaValidationFinding } from "@/lib/schemas/validate";
import type { ForkProvenance, SchemaLayer } from "@/lib/schemas/fork";

/** Manifest kind discriminator. */
export const SCHEMA_PACKAGE_KIND = "openspec-schema-package" as const;
/** Current package format version. */
export const SCHEMA_PACKAGE_FORMAT_VERSION = 1;

/** The manifest embedded in a schema package (05.10 AC a). */
export interface SchemaPackageManifest {
  kind: typeof SCHEMA_PACKAGE_KIND;
  formatVersion: number;
  schemaName: string;
  schemaVersion: string;
  /** Files included in the package, repo-relative to the schema dir. */
  files: string[];
  /** Dashboard-side fork provenance, when the schema was forked. */
  provenance?: ForkProvenance;
}

/** A complete in-memory schema package. */
export interface SchemaPackage {
  manifest: SchemaPackageManifest;
  files: Record<string, string>;
}

/** Serialized form (the "tarball" contents the route layer ships). */
export interface SerializedSchemaPackage {
  manifest: SchemaPackageManifest;
  files: Record<string, string>;
}

/** Input to `buildSchemaPackage`. */
export interface SchemaPackageInput {
  /** Schema definition body (YAML), written to `schema.yaml`. */
  definition: string;
  /** Template files keyed by repo-relative path within the schema dir. */
  templates: Record<string, string>;
  provenance?: ForkProvenance;
}

/** A file to write on import. */
export interface SchemaImportFile {
  path: string;
  body: string;
}

export type SchemaImportPlan =
  | {
      ok: true;
      targetDir: string;
      schemaName: string;
      files: SchemaImportFile[];
    }
  | {
      ok: false;
      errors: SchemaValidationFinding[];
      collisions: string[];
      /** Undefined on failure — atomic: no partial writes. */
      files?: undefined;
    };

const DEFINITION_PATH = "schema.yaml";

/**
 * Build a schema package from definition + templates + provenance. Reads the
 * schema name/version out of the YAML definition for the manifest.
 */
export function buildSchemaPackage(input: SchemaPackageInput): SchemaPackage {
  const parsed = parseDefinition(input.definition);
  const files: Record<string, string> = {
    [DEFINITION_PATH]: input.definition,
    ...input.templates,
  };
  const manifest: SchemaPackageManifest = {
    kind: SCHEMA_PACKAGE_KIND,
    formatVersion: SCHEMA_PACKAGE_FORMAT_VERSION,
    schemaName: parsed.name ?? "unknown",
    schemaVersion: String(parsed.version ?? ""),
    files: Object.keys(files).sort(),
    ...(input.provenance ? { provenance: input.provenance } : {}),
  };
  return { manifest, files };
}

/** Serialize a package to a string (the route layer wraps this as a tarball). */
export function serializeSchemaPackage(pkg: SchemaPackage): string {
  const envelope: SerializedSchemaPackage = {
    manifest: pkg.manifest,
    files: pkg.files,
  };
  return JSON.stringify(envelope);
}

/**
 * Parse + validate a serialized package (05.10 AC b — validate before write).
 * Throws when the manifest is malformed or declared files are missing.
 */
export function parseSchemaPackage(serialized: string): SchemaPackage {
  let envelope: SerializedSchemaPackage;
  try {
    envelope = JSON.parse(serialized) as SerializedSchemaPackage;
  } catch (err) {
    throw new Error(`Schema package is not valid JSON: ${(err as Error).message}`);
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !envelope.manifest ||
    !envelope.files
  ) {
    throw new Error("Schema package manifest is missing or malformed.");
  }
  if (envelope.manifest.kind !== SCHEMA_PACKAGE_KIND) {
    throw new Error(
      `Schema package manifest kind "${envelope.manifest.kind}" is unsupported.`,
    );
  }
  // Every declared file must be present (atomic — no partial reads).
  for (const declared of envelope.manifest.files) {
    if (!(declared in envelope.files)) {
      throw new Error(`Schema package is missing declared file "${declared}".`);
    }
  }
  return { manifest: envelope.manifest, files: envelope.files };
}

/**
 * Plan an import: validate the definition, detect name collisions, and only
 * return a write plan when everything is clean (05.10 AC b — atomic).
 */
export function planSchemaImport(
  pkg: SchemaPackage,
  opts: { existingNames: string[] },
): SchemaImportPlan {
  const definition = pkg.files[DEFINITION_PATH];
  const errors: SchemaValidationFinding[] = definition
    ? validateSchema(definition)
    : [
        {
          ruleId: "schema.definition-missing",
          severity: "error",
          message: "Package is missing the schema.yaml definition file.",
        },
      ];

  const collisions = opts.existingNames.filter(
    (name) => name === pkg.manifest.schemaName,
  );

  if (errors.length > 0 || collisions.length > 0) {
    return { ok: false, errors, collisions };
  }

  const targetDir = `openspec/schemas/${pkg.manifest.schemaName}`;
  const files: SchemaImportFile[] = Object.entries(pkg.files)
    .map(([path, body]) => ({
      path: `${targetDir}/${path}`,
      body,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    ok: true,
    targetDir,
    schemaName: pkg.manifest.schemaName,
    files,
  };
}

/** Minimal YAML reader for `name` / `version` at the top level. */
function parseDefinition(definition: string): { name?: string; version?: string | number } {
  const out: { name?: string; version?: string | number } = {};
  for (const line of definition.split(/\r?\n/)) {
    const m = line.match(/^name:\s*(.+?)\s*$/);
    if (m) out.name = m[1];
    const v = line.match(/^version:\s*(.+?)\s*$/);
    if (v) {
      const raw = v[1];
      out.version = /^\d+$/.test(raw) ? Number(raw) : raw;
    }
  }
  return out;
}

// Re-exported for callers that construct provenance inline.
export type { ForkProvenance, SchemaLayer };
