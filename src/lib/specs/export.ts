/**
 * Task 4.4 — Spec export (req 02 §2.9).
 *
 * Export a spec (or all specs in a domain) as Markdown (verbatim), PDF, or
 * structured JSON (parsed AST).
 *  - AC (a): JSON schema of the export is documented and versioned
 *    ({@link EXPORT_JSON_SCHEMA_VERSION}).
 *  - AC (b): PDF export renders scenarios with Given/When/Then emphasis and a
 *    per-requirement anchor index.
 *  - Non-goals: Word/.docx export; live-linked exports (export is a snapshot).
 *
 * Source: `flow/requirements/02-specs.md` §2.9.
 */

/** A scenario ready for export. */
export interface ExportableScenario {
  name: string;
  /** Verbatim body (Given/When/Then bullets preserved). */
  body: string;
}

/** A requirement ready for export. */
export interface ExportableRequirement {
  name: string;
  body: string;
  scenarios: ExportableScenario[];
}

/** A spec ready for export (a single domain, all requirements). */
export interface ExportableSpec {
  domain: string;
  capability: string;
  /** Repository-relative path of the source `spec.md`. */
  filePath: string;
  requirements: ExportableRequirement[];
}

/**
 * Semantic version of the structured JSON export schema (req 02 §2.9 AC a).
 * Breaking changes to the JSON shape bump the MAJOR; additive changes bump
 * MINOR; documentation-only fixes bump PATCH.
 */
export const EXPORT_JSON_SCHEMA_VERSION = "1.0.0" as const;

/** A per-requirement anchor index entry (req 02 §2.9 AC b). */
export interface PdfAnchorIndexEntry {
  requirement: string;
  /** URL-fragment-safe anchor for the PDF layer to link to. */
  anchor: string;
}

/** A renderable section for the PDF export layer. */
export type PdfSection =
  | {
      kind: "requirement";
      requirement: string;
      body: string;
    }
  | {
      kind: "scenario";
      requirement: string;
      scenario: string;
      /** GWT emphasis (req 02 §2.9 AC b). */
      given: string;
      when: string;
      then: string;
    };

/** The PDF export document model (req 02 §2.9 AC b). */
export interface PdfExport {
  domain: string;
  /** Per-requirement anchor index (AC b). */
  anchorIndex: PdfAnchorIndexEntry[];
  /** Ordered render sections (requirements + GWT-emphasised scenarios). */
  sections: PdfSection[];
}

/** Structured JSON export (parsed AST + versioned schema — AC a). */
export interface JsonExport {
  schemaVersion: typeof EXPORT_JSON_SCHEMA_VERSION;
  spec: ExportableSpec;
}

/**
 * Re-emit the parsed model as Markdown (req 02 §2.9 — "Markdown (verbatim)").
 * "Verbatim" here means the round-trip preserves the requirement titles, body
 * prose, and Given/When/Then bullet structure the parser captured — not byte
 * fidelity to the original file (the parser intentionally normalises leading
 * whitespace). The UI offers this as the canonical Markdown export.
 */
export function exportSpecMarkdown(spec: ExportableSpec): string {
  const lines: string[] = [`# ${spec.capability}`, ""];

  for (const req of spec.requirements) {
    lines.push(`### Requirement: ${req.name}`);
    lines.push("");
    const body = req.body.trim();
    if (body) {
      lines.push(body);
      lines.push("");
    }
    for (const scenario of req.scenarios) {
      lines.push(`#### Scenario: ${scenario.name}`);
      lines.push("");
      const sb = scenario.body.trim();
      if (sb) {
        lines.push(sb);
        lines.push("");
      }
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/**
 * Emit a structured JSON AST with a documented, versioned schema
 * (req 02 §2.9 AC a). The result is plain JSON-serialisable (no functions or
 * symbols) so callers can `JSON.stringify` it straight onto the wire.
 */
export function exportSpecJson(spec: ExportableSpec): JsonExport {
  return {
    schemaVersion: EXPORT_JSON_SCHEMA_VERSION,
    spec,
  };
}

/** A scenario whose body lacks any GWT bullet. */
const GWT_RE = /\*\*(GIVEN|WHEN|THEN)\*\*/i;

/**
 * Emit the PDF document model: per-requirement anchor index plus ordered
 * render sections where scenarios carry Given/When/Then emphasis
 * (req 02 §2.9 AC b). Scenarios that do not use the structured GWT bullets
 * still emit empty emphasis fields so the PDF layer has a uniform shape.
 */
export function exportSpecPdf(spec: ExportableSpec): PdfExport {
  const anchorIndex: PdfAnchorIndexEntry[] = [];
  const sections: PdfSection[] = [];

  for (const req of spec.requirements) {
    anchorIndex.push({
      requirement: req.name,
      anchor: `requirement-${slugify(req.name)}`,
    });
    sections.push({
      kind: "requirement",
      requirement: req.name,
      body: req.body,
    });
    for (const scenario of req.scenarios) {
      const { given, when, then } = extractGwt(scenario.body);
      sections.push({
        kind: "scenario",
        requirement: req.name,
        scenario: scenario.name,
        given,
        when,
        then,
      });
    }
  }

  return { domain: spec.domain, anchorIndex, sections };
}

/** Extract the GIVEN/WHEN/THEN emphasis from a scenario body. */
function extractGwt(body: string): { given: string; when: string; then: string } {
  const out = { given: "", when: "", then: "" };
  if (!GWT_RE.test(body)) return out;
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*-\s+\*\*(GIVEN|WHEN|THEN)\*\*\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase() as "given" | "when" | "then";
    out[key] = m[2].trim();
  }
  return out;
}

/** Lowercase, kebab-case anchor slug for a requirement title. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
