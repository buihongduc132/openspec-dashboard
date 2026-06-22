/**
 * Task 4.5 — Schema authoring: activation (req 05 §5.8).
 *
 * `planSchemaActivation` is a pure planning function: switching a project's
 * default schema writes ONLY the `config.yaml` default-schema key — it never
 * mutates existing changes (05.8 AC a). It surfaces:
 *   - `inFlightWarnings`: in-flight changes still authored under the previous
 *     schema, so the UI can warn before the switch.
 *   - `perChangeOverrides`: changes that carry a per-change schema override
 *     (in `.openspec.yaml`), which MUST be respected (05.8 AC b).
 *
 * Source: `flow/requirements/05-schemas.md` §5.8.
 */

/** A change and the schema it was authored under. */
export interface ChangeSchemaState {
  changeId: string;
  name: string;
  /** Schema the change was created with. */
  schemaName: string;
  /** True when the change carries a per-change `.openspec.yaml` override. */
  overridden: boolean;
}

/** Input to `planSchemaActivation`. */
export interface SchemaActivationInput {
  projectId: string;
  fromSchema: string;
  toSchema: string;
  changes: ChangeSchemaState[];
}

/** A config file write the route layer must perform. */
export interface SchemaConfigUpdate {
  file: string;
  key: string;
  value: string;
}

/** A warning about an in-flight change authored under the previous schema. */
export interface InFlightWarning {
  changeId: string;
  name: string;
  schemaName: string;
}

/** A change whose schema differs from the project default via override. */
export interface PerChangeOverride {
  changeId: string;
  name: string;
  schemaName: string;
}

/** The activation plan returned by `planSchemaActivation`. */
export interface SchemaActivationPlan {
  projectId: string;
  fromSchema: string;
  toSchema: string;
  /** Only ever the single config.yaml default-schema write. */
  configUpdates: SchemaConfigUpdate[];
  /** Per-change writes — ALWAYS empty (activation never mutates changes). */
  changeWrites: never[];
  inFlightWarnings: InFlightWarning[];
  perChangeOverrides: PerChangeOverride[];
}

/**
 * Plan a schema activation switch. Pure: returns what a route layer should
 * write + which warnings/overrides to surface.
 */
export function planSchemaActivation(
  input: SchemaActivationInput,
): SchemaActivationPlan {
  const inFlightWarnings: InFlightWarning[] = [];
  const perChangeOverrides: PerChangeOverride[] = [];

  for (const change of input.changes) {
    if (change.overridden) {
      // Per-change override is respected (05.8 AC b). It is NOT a warning
      // — it is surfaced separately so the UI can render the override badge.
      perChangeOverrides.push({
        changeId: change.changeId,
        name: change.name,
        schemaName: change.schemaName,
      });
      continue;
    }
    if (change.schemaName === input.fromSchema) {
      inFlightWarnings.push({
        changeId: change.changeId,
        name: change.name,
        schemaName: change.schemaName,
      });
    }
  }

  return {
    projectId: input.projectId,
    fromSchema: input.fromSchema,
    toSchema: input.toSchema,
    configUpdates: [
      {
        file: "openspec/config.yaml",
        key: "default-schema",
        value: input.toSchema,
      },
    ],
    changeWrites: [],
    inFlightWarnings,
    perChangeOverrides,
  };
}
