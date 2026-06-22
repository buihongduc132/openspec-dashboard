/**
 * Task 6.5 — Visual schema editor (req 05.5 per D-SchemaEditor).
 *
 * Pure module implementing the two-pane editor's data binding:
 *   - {@link parseSchemaDocument}: parse YAML into a yaml Document (preserves
 *     comments, ordering, unknown keys — INV-2 region-scoped byte fidelity).
 *   - {@link buildVisualForm}: derive a flat, UI-friendly projection of the
 *     schema from the Document.
 *   - {@link applyVisualEdit}: mutate the Document via the Document API so
 *     untouched regions and comments are byte-preserved on re-stringification.
 *   - {@link buildSavePayload}: shape a save payload including the whole-file
 *     If-Match ETag (INV-7) — schema files are whole-file single-writer.
 *
 * Source: `openspec/changes/phase3b-integration/specs/schema-visual-editor/spec.md`.
 */
import { parseDocument, Document, YAMLMap, Scalar } from "yaml";

/** Visual-model representation of one artifact (flat, UI-friendly). */
export interface VisualFormArtifact {
  id: string;
  generates: string;
  requires?: string[];
  template?: string;
  apply?: { requires?: string[]; tracks?: string };
}

/** Flat projection of the schema for the visual pane. */
export interface VisualForm {
  name?: string;
  version?: string;
  description?: string;
  artifacts: VisualFormArtifact[];
}

/** Successful parse result. */
export interface ParseSuccess {
  ok: true;
  document: Document.Parsed;
}

/** Failed parse result (syntax error in the YAML text). */
export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Parse a `schema.yaml` source into a yaml Document. Errors are returned
 * as a `ParseFailure` rather than thrown, so the UI can surface them inline
 * without crashing the editor (05.5 live validation).
 */
export function parseSchemaDocument(source: string): ParseResult {
  let doc: Document.Parsed;
  try {
    doc = parseDocument(source) as Document.Parsed;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (doc.errors.length > 0) {
    return { ok: false, error: doc.errors[0].message };
  }
  return { ok: true, document: doc };
}

/**
 * Derive the visual form model from a parsed Document. Unknown keys are
 * preserved in the Document (and thus in the YAML on re-stringify) but are
 * not surfaced in the visual form.
 */
export function buildVisualForm(doc: Document.Parsed): VisualForm {
  const obj = (doc.toJS() as Record<string, unknown>) ?? {};
  const artifacts = Array.isArray(obj.artifacts)
    ? obj.artifacts
        .filter(
          (a): a is Record<string, unknown> =>
            a !== null && typeof a === "object",
        )
        .map((a) => ({
          id: String(a.id ?? ""),
        generates: String(a.generates ?? ""),
        requires: asStringArray(a.requires),
        template: a.template ? String(a.template) : undefined,
        apply:
          a.apply && typeof a.apply === "object"
            ? {
                requires: asStringArray((a.apply as Record<string, unknown>).requires),
                tracks: (a.apply as Record<string, unknown>).tracks
                  ? String((a.apply as Record<string, unknown>).tracks)
                  : undefined,
              }
            : undefined,
      }))
    : [];
  return {
    name: obj.name ? String(obj.name) : undefined,
    version: obj.version != null ? String(obj.version) : undefined,
    description: obj.description ? String(obj.description) : undefined,
    artifacts,
  };
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map(String);
}

/** Discriminated union of visual-pane edits. */
export type VisualSchemaEdit =
  | { type: "artifact-apply-requires"; artifactId: string; requires: string[] }
  | { type: "artifact-apply-tracks"; artifactId: string; tracks: string }
  | { type: "artifact-requires"; artifactId: string; requires: string[] }
  | { type: "set-name"; name: string }
  | { type: "set-description"; description: string };

/**
 * Apply a visual edit to a Document. Operates via the yaml Document API so
 * only the targeted nodes are rewritten — comments, key ordering, and
 * YAML-only keys outside the edit region are preserved (INV-2).
 *
 * Returns the same Document (mutated in place). Callers that need the prior
 * snapshot should clone before calling.
 */
export function applyVisualEdit(
  doc: Document.Parsed,
  edit: VisualSchemaEdit,
): Document.Parsed {
  switch (edit.type) {
    case "set-name":
      doc.set("name", edit.name);
      return doc;
    case "set-description":
      doc.set("description", edit.description);
      return doc;
    case "artifact-requires":
    case "artifact-apply-requires":
    case "artifact-apply-tracks":
      return applyArtifactEdit(doc, edit);
  }
}

function applyArtifactEdit(
  doc: Document.Parsed,
  edit:
    | { type: "artifact-apply-requires"; artifactId: string; requires: string[] }
    | { type: "artifact-apply-tracks"; artifactId: string; tracks: string }
    | { type: "artifact-requires"; artifactId: string; requires: string[] },
): Document.Parsed {
  const artifacts = doc.get("artifacts");
  if (!artifacts) return doc;
  const items = (artifacts as unknown as { items: unknown[] }).items;
  if (!Array.isArray(items)) return doc;

  for (const item of items) {
    const node = item as YAMLMap | null;
    if (!node || !(node instanceof YAMLMap)) continue;
    const idPair = node.items.find(
      (p) => (p.key as Scalar)?.value === "id",
    );
    if (!idPair) continue;
    if ((idPair.value as Scalar)?.value !== edit.artifactId) continue;

    if (edit.type === "artifact-requires") {
      node.set("requires", doc.createNode(edit.requires));
    } else if (edit.type === "artifact-apply-tracks") {
      ensureApplyMap(doc, node).set("tracks", doc.createNode(edit.tracks));
    } else {
      // artifact-apply-requires
      ensureApplyMap(doc, node).set("requires", doc.createNode(edit.requires));
    }
    return doc;
  }
  return doc;
}

function ensureApplyMap(doc: Document.Parsed, artifact: YAMLMap): YAMLMap {
  const existing = artifact.get("apply");
  if (existing instanceof YAMLMap) return existing;
  const m = new YAMLMap();
  artifact.set("apply", m);
  return m;
}

/** Input for {@link buildSavePayload}. */
export interface SavePayloadInput {
  document: Document.Parsed;
  schemaPath: string;
  /** Whole-file `If-Match` ETag (INV-7). */
  ifMatch: string;
}

/** Payload shape a save route sends to the API layer. */
export interface SavePayload {
  schemaPath: string;
  /** Whole-file If-Match ETag (INV-7 — schema files are single-writer). */
  ifMatch: string;
  body: string;
}

/** Shape the save payload for the schema save endpoint. */
export function buildSavePayload(input: SavePayloadInput): SavePayload {
  return {
    schemaPath: input.schemaPath,
    ifMatch: input.ifMatch,
    body: input.document.toString(),
  };
}
