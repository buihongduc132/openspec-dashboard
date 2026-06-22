"use client";

/**
 * Task 6.5 — Two-pane visual schema editor (req 05.5 / D-SchemaEditor).
 *
 * Source: `openspec/changes/phase3b-integration/specs/schema-visual-editor/spec.md`.
 *
 * Two panes, two-way bound:
 *   - VISUAL pane: name/description fields + per-artifact rows (id, generates,
 *     requires, apply.requires, apply.tracks). Editing these mutates the
 *     underlying YAML Document via the pure module (`applyVisualEdit`) so
 *     comments / ordering / unknown keys are preserved (INV-2).
 *   - YAML pane: a raw `schema.yaml` textarea. Editing it re-parses into the
 *     Document and re-projects into the visual form (`buildVisualForm`).
 *
 * Live validation (`validateSchema`, req 05.2) surfaces findings inline in
 * both panes; the Save action is disabled while any `error`-severity finding
 * exists (INV-6: validation before write).
 *
 * Whole-file ETag concurrency (INV-7): the Save button invokes `onSave` with
 * a `SavePayload` carrying the whole-file `If-Match` ETag. When the parent
 * reports a stale-ETag conflict (status `"conflict"`), an out-of-band reload
 * / merge banner is shown (requirement: "Out-of-band edit conflict
 * detection").
 */
import { useCallback, useMemo, useState } from "react";
import {
  applyVisualEdit,
  buildSavePayload,
  buildVisualForm,
  parseSchemaDocument,
  type SavePayload,
  type VisualForm,
} from "@/lib/schemas/visual-editor";
import { validateSchema } from "@/lib/schemas/validate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Save status reported by the host page. */
export type SaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";

export interface VisualSchemaEditorProps {
  /** Initial `schema.yaml` source. */
  initialSource: string;
  /** Whole-file ETag captured when the schema was loaded (INV-7). */
  initialIfMatch: string;
  /** Schema file path (used in the save payload). */
  schemaPath: string;
  /** Persist the save. Host returns a conflict when If-Match is stale. */
  onSave: (payload: SavePayload) => Promise<SaveStatus>;
}

/**
 * Flatten a VisualForm into editable rows for the visual pane. Stable index
 * keys (artifact id + position) keep React reconciliation deterministic.
 */
interface ArtifactRow {
  key: string;
  id: string;
  generates: string;
  requires: string;
  applyRequires: string;
  applyTracks: string;
}

function toRows(form: VisualForm): ArtifactRow[] {
  return form.artifacts.map((a, i) => ({
    key: `${a.id || `__${i}`}-${i}`,
    id: a.id,
    generates: a.generates,
    requires: (a.requires ?? []).join(", "),
    applyRequires: (a.apply?.requires ?? []).join(", "),
    applyTracks: a.apply?.tracks ?? "",
  }));
}

export default function VisualSchemaEditor({
  initialSource,
  initialIfMatch,
  schemaPath,
  onSave,
}: VisualSchemaEditorProps) {
  const [source, setSource] = useState(initialSource);
  const [ifMatch] = useState(initialIfMatch);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // Local (un-normalized) text for comma-separated inputs, keyed by artifact id.
  // Prevents commas from being erased on every keystroke; normalized on blur.
  const [localRequires, setLocalRequires] = useState<Record<string, string>>({});

  // Central source of truth: the parsed YAML Document. Recomputed whenever
  // the YAML text changes so both panes stay two-way bound.
  const parsed = useMemo(() => parseSchemaDocument(source), [source]);
  const form = useMemo<VisualForm | null>(
    () => (parsed.ok ? buildVisualForm(parsed.document) : null),
    [parsed],
  );
  const findings = useMemo(() => validateSchema(source), [source]);
  const errors = useMemo(
    () => findings.filter((f) => f.severity === "error"),
    [findings],
  );
  const hasErrors = errors.length > 0;

  /**
   * Apply a visual edit to the Document, then re-stringify back into the
   * YAML pane text — this is the visual -> YAML direction of the two-way
   * binding. Using the Document API preserves comments / unknown keys (INV-2).
   */
  const pushVisualEdit = useCallback(
    (edit: Parameters<typeof applyVisualEdit>[1]) => {
      setSource((prev) => {
        const p = parseSchemaDocument(prev);
        if (!p.ok) return prev; // never mutate an unparseable doc
        const next = applyVisualEdit(p.document, edit);
        return next.toString();
      });
    },
    [],
  );

  // --- visual-pane handlers -------------------------------------------------
  const onName = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      pushVisualEdit({ type: "set-name", name: e.target.value }),
    [pushVisualEdit],
  );
  const onDescription = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      pushVisualEdit({ type: "set-description", description: e.target.value }),
    [pushVisualEdit],
  );
  const commitRequires = useCallback(
    (id: string) => {
      const raw = localRequires[id];
      if (raw === undefined) return;
      const normalized = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      pushVisualEdit({
        type: "artifact-requires",
        artifactId: id,
        requires: normalized,
      });
      // Clear local override so form-derived values show through again.
      setLocalRequires((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [localRequires, pushVisualEdit],
  );
  const onArtifactApplyTracks = useCallback(
    (id: string, e: React.ChangeEvent<HTMLInputElement>) =>
      pushVisualEdit({
        type: "artifact-apply-tracks",
        artifactId: id,
        tracks: e.target.value,
      }),
    [pushVisualEdit],
  );

  // --- YAML-pane handler (YAML -> visual) -----------------------------------
  const onYaml = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setSource(e.target.value),
    [],
  );

  const onSaveClick = useCallback(async () => {
    if (hasErrors) return; // INV-6: validation before write
    if (!parsed.ok) return;
    setSaveStatus("saving");
    const payload = buildSavePayload({
      document: parsed.document,
      schemaPath,
      ifMatch,
    });
    const status = await onSave(payload);
    setSaveStatus(status);
  }, [hasErrors, parsed, schemaPath, ifMatch, onSave]);

  const rows = form ? toRows(form) : [];
  const yamlParseError = !parsed.ok ? parsed.error : null;

  return (
    <div className="space-y-4" data-testid="visual-schema-editor">
      {/* Out-of-band / stale-ETag conflict banner (INV-7 whole-file). */}
      {saveStatus === "conflict" && (
        <div
          role="alert"
          data-testid="conflict-banner"
          className="rounded-md border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          The schema file changed out-of-band (stale If-Match). Reload to merge
          the external change before saving again.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- VISUAL PANE ---------------- */}
        <Card data-testid="visual-pane">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              Visual form
              <Badge variant="secondary" className="text-[10px]">visual</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {form ? (
              <>
                <label className="block text-xs font-medium" htmlFor="vse-name">
                  Name
                </label>
                <Input
                  id="vse-name"
                  aria-label="Schema name"
                  value={form.name ?? ""}
                  onChange={onName}
                />
                <label
                  className="block text-xs font-medium"
                  htmlFor="vse-description"
                >
                  Description
                </label>
                <Input
                  id="vse-description"
                  aria-label="Schema description"
                  value={form.description ?? ""}
                  onChange={onDescription}
                />
                <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Artifacts
                </div>
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className="space-y-1 rounded-md border border-border/60 p-3"
                    data-testid={`artifact-row-${row.id}`}
                  >
                    <div className="text-xs font-semibold">{row.id}</div>
                    <div className="text-[11px] text-muted-foreground">
                      generates: {row.generates}
                    </div>
                    <label
                      className="block text-[11px] font-medium"
                      htmlFor={`requires-${row.id}`}
                    >
                      requires (comma-separated)
                    </label>
                    <Input
                      id={`requires-${row.id}`}
                      aria-label={`requires for ${row.id}`}
                      value={localRequires[row.id] ?? row.requires}
                      onChange={(e) =>
                        setLocalRequires((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      onBlur={() => commitRequires(row.id)}
                    />
                    <label
                      className="block text-[11px] font-medium"
                      htmlFor={`tracks-${row.id}`}
                    >
                      apply.tracks
                    </label>
                    <Input
                      id={`tracks-${row.id}`}
                      aria-label={`apply.tracks for ${row.id}`}
                      value={row.applyTracks}
                      onChange={(e) => onArtifactApplyTracks(row.id, e)}
                    />
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Visual pane unavailable while YAML is unparseable.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ---------------- YAML PANE ---------------- */}
        <Card data-testid="yaml-pane">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              Raw schema.yaml
              <Badge variant="secondary" className="text-[10px]">yaml</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              aria-label="Raw schema.yaml"
              className="min-h-[280px] w-full rounded-md border border-border/60 bg-background p-3 font-mono text-xs"
              value={source}
              onChange={onYaml}
            />
            {/* Live inline validation (req 05.2 / live-validation requirement). */}
            {yamlParseError && (
              <p
                role="alert"
                data-testid="yaml-parse-error"
                className="text-xs text-destructive"
              >
                YAML parse error: {yamlParseError}
              </p>
            )}
            {errors.map((f, i) => (
              <p
                key={`${f.ruleId}-${i}`}
                data-testid={`validation-error-${i}`}
                className="text-xs text-destructive"
              >
                {f.ruleId}: {f.message}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Save bar — blocked while error-severity findings exist (INV-6). */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={onSaveClick}
          disabled={hasErrors || !parsed.ok || saveStatus === "saving"}
          data-testid="save-button"
        >
          {saveStatus === "saving" ? "Saving…" : "Save schema"}
        </Button>
        {saveStatus === "saved" && (
          <span className="text-xs text-emerald-600">Saved.</span>
        )}
        {saveStatus === "error" && (
          <span className="text-xs text-destructive">Save failed.</span>
        )}
        {hasErrors && (
          <span
            className="text-xs text-muted-foreground"
            data-testid="save-blocked"
          >
            Save blocked — fix validation errors first.
          </span>
        )}
      </div>
    </div>
  );
}
