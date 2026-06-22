/**
 * Task 4.5 — Schema authoring: creation (req 05 §5.3).
 *
 * `planSchemaCreation` is a pure function: it validates the requested schema
 * (reusing the documented upstream invariants) and, on success, returns the
 * complete set of files a route layer must write to scaffold the new
 * project-local schema directory + template files (05.3 AC b). It performs
 * NO filesystem I/O — the caller owns the atomic write.
 *
 * Source: `flow/requirements/05-schemas.md` §5.3.
 */
import { stringify as stringifyYaml } from "yaml";
import {
  validateSchema,
  type SchemaValidationFinding,
} from "@/lib/schemas/validate";

/** One artifact declared in a creation request. */
export interface SchemaCreationArtifactInput {
  id: string;
  generates: string;
  requires?: string[];
  apply?: { requires?: string[]; tracks?: string };
  /** Path of the template file, relative to the schema dir. */
  template?: string;
  /** Body of the template file (05.3 AC b — scaffold from a starter body). */
  templateBody?: string;
}

/** The input to `planSchemaCreation`. */
export interface SchemaCreationInput {
  name: string;
  version: string;
  description?: string;
  projectId: string;
  artifacts: SchemaCreationArtifactInput[];
}

/** A file to write as part of scaffolding the new schema. */
export interface SchemaCreationFile {
  /** Repo-relative path. */
  path: string;
  body: string;
}

/** Successful creation plan — every file needed to materialize the schema. */
export interface SchemaCreationPlan {
  /** Schema name (kebab-case). */
  name: string;
  /** Schema directory, repo-relative. */
  schemaDir: string;
  /** Project the schema belongs to. */
  projectId: string;
  files: SchemaCreationFile[];
}

export type SchemaCreationResult =
  | { ok: true; plan: SchemaCreationPlan }
  | { ok: false; errors: SchemaValidationFinding[] };

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Validate + scaffold a new project-local schema.
 *
 * Validation (05.3 AC a) reuses the documented upstream rules:
 *   - no circular `requires` DAG,
 *   - artifact IDs unique and kebab-case,
 *   - `requires` references resolve,
 *   - declared template paths have a starter body (will be created).
 */
export function planSchemaCreation(
  input: SchemaCreationInput,
): SchemaCreationResult {
  const errors: SchemaValidationFinding[] = [];

  if (!KEBAB_CASE.test(input.name)) {
    errors.push({
      ruleId: "schema.name-format",
      severity: "error",
      message: `Schema name "${input.name}" must be kebab-case.`,
      suggestedFix: input.name
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[_\s]+/g, "-")
        .toLowerCase(),
    });
  }

  // Reuse the upstream validator for the structural checks. New schemas do
  // not have template files on disk yet, so we drop the validator's
  // template-existence findings (it cannot know the files are about to be
  // created) and perform our own template-body check below.
  const definitionYaml = buildDefinitionYaml(input);
  errors.push(
    ...validateSchema(definitionYaml).filter(
      (f) => f.ruleId !== "schema.template-missing",
    ),
  );

  // Template bodies: every declared template path must have a body so the
  // scaffold does not write empty files (05.3 AC b "templates ... will be
  // created").
  for (const art of input.artifacts) {
    if (art.template && String(art.template).trim().length > 0) {
      const body = (art.templateBody ?? "").trim();
      if (body.length === 0) {
        errors.push({
          ruleId: "schema.template-missing",
          severity: "error",
          artifactId: art.id,
          message: `Artifact "${art.id}" declares template "${art.template}" with no starter body.`,
          suggestedFix: `Provide a starter body for ${art.template}.`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, plan: buildPlan(input, definitionYaml) };
}

/** Serialize the schema definition block as the `schema.yaml` file body. */
function buildDefinitionYaml(input: SchemaCreationInput): string {
  const doc = {
    name: input.name,
    version: input.version,
    ...(input.description ? { description: input.description } : {}),
    artifacts: input.artifacts.map((a) => ({
      id: a.id,
      generates: a.generates,
      ...(a.requires && a.requires.length > 0 ? { requires: a.requires } : {}),
      ...(a.template ? { template: a.template } : {}),
      ...(a.apply ? { apply: a.apply } : {}),
    })),
  };
  return stringifyYaml(doc);
}

/** Build the scaffolding file list: schema.yaml + one file per template. */
function buildPlan(
  input: SchemaCreationInput,
  definitionYaml: string,
): SchemaCreationPlan {
  const schemaDir = `openspec/schemas/${input.name}`;
  const files: SchemaCreationFile[] = [
    { path: `${schemaDir}/schema.yaml`, body: definitionYaml },
  ];
  const seen = new Set<string>();
  for (const art of input.artifacts) {
    if (!art.template || seen.has(art.template)) continue;
    seen.add(art.template);
    files.push({
      path: `${schemaDir}/${art.template}`,
      body: art.templateBody ?? "",
    });
  }
  return {
    name: input.name,
    schemaDir,
    projectId: input.projectId,
    files,
  };
}
