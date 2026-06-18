# Requirements 05 — Schema Management

> Schemas define what a change must produce. Cross-cutting INV-1, INV-2, INV-6. Upstream
> `openspec schema fork` output format is unconfirmed; `forked_from` provenance is a
> **dashboard-side metadata field** under `openspec/.dashboard/`, not an invented upstream
> key.

## 5.1 Schema listing (three layers)

**Shall:** List every resolvable schema from all three layers: **built-in**, **user-level**
(`~/.local/share/openspec/schemas/`), **project-local** (`openspec/schemas/`). Each entry:
name, version, source layer, artifact count, active?

**AC:**
- (a) Resolution precedence displayed (project → user → built-in).
- (b) "Active" badge marks the schema set as default in `config.yaml`.

## 5.2 Schema detail view

**Shall:** Render a schema's definition: name, version, description, artifact list with
`generates` / `requires` / `apply.requires` / `apply.tracks`, plus a visual DAG of artifact
dependencies.

**AC:**
- (a) DAG visualization identical in style to the change-artifact DAG (consistency).
- (b) Template file preview for each artifact (rendered Markdown).

## 5.3 Schema creation

**Shall:** Create a new custom schema (project-local by default): name, version,
description, artifact list. Each artifact defines `generates`, `requires`, `apply.requires`,
`apply.tracks`, and a template path.

**AC:**
- (a) Validation: no circular `requires` DAG, all template paths exist (or will be created),
  artifact IDs unique and kebab-case.
- (b) Schema creation scaffolds the schema dir + template files from a starter template.

## 5.4 Schema forking

**Shall:** Fork an existing schema (built-in or user-level) into a project-local copy for
customization. Provenance recorded in dashboard-side metadata (`openspec/.dashboard/schema-forks.json`):
forked-from name + version + fork timestamp. NOT an invented upstream `forked_from` YAML key.

**AC:**
- (a) Fork provenance enables "diff against upstream" using the recorded source.
- (b) "Diff against upstream" action shows what the fork changed (file-level diff).

## 5.5 Schema editor (visual + YAML — owned: Phase 3 per D-SchemaEditor)

**Shall:** Two-pane editor: visual form (artifact list with dependency picker, template
selector, apply flags) + raw `schema.yaml` with live validation and two-way sync.

**AC:**
- (a) Visual ↔ YAML two-way binding with conflict detection (warns if YAML edited
  out-of-band and offers reload).
- (b) YAML-only keys not surfaced in the visual form are preserved verbatim (round-trip
  safe).

## 5.6 Template management

**Shall:** Edit artifact templates (Markdown files) per schema artifact. Preview the
rendered output with sample variables injected.

**AC:**
- (a) Template variable autocomplete (`{{name}}`, `{{context.*}}`, `{{date}}`).
- (b) Preview uses the current project's context block from `config.yaml`.

## 5.7 Schema validation

**Shall:** Validate a schema: no circular deps, all template files exist, artifact IDs
valid, YAML syntactically valid, `apply.tracks` references real artifact IDs.

**AC:**
- (a) Validation surfaced inline (per-artifact) + as a report.
- (b) "Apply fix" available for deterministic issues (e.g., create missing template file).

## 5.8 Schema activation

**Shall:** Set a schema as the project default by writing `config.yaml`'s default-schema
key. Switching schemas warns about in-flight changes authored under the previous schema.

**AC:**
- (a) Switching schema does NOT mutate existing changes; only affects new change creation.
- (b) Per-change schema override (in `.openspec.yaml`) is respected and surfaced.

## 5.9 Schema resolution debug

**Shall:** For any schema reference, show the full resolution path (project → user →
built-in) and which layer actually served the schema.

**AC:**
- (a) Resolution log shows each candidate path + hit/miss.
- (b) "Why not my fork?" diagnostic with actionable suggestions (typo, wrong layer, etc.).

## 5.10 Schema export/import

**Shall:** Export a schema (definition + templates) as a tarball. Import a schema tarball
into the project-local layer with a name-collision prompt.

**AC:**
- (a) Tarball includes a manifest with schema version + fork provenance (dashboard-side).
- (b) Import validates before writing; atomic (all-or-nothing).
