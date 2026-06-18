# Requirements 01 — Project, Workspace, Context Store

> Strong voice. Cross-cutting invariants INV-1..INV-8 (+INV-4a) apply (see `README.md`); **there is no INV-9/10/11**.

## 1.1 Project registration (hardened)

**Shall:** Register a project by pointing at a repo path (local absolute path within an
**allowlisted root set**, or remote URL cloned into a **sandboxed** managed dir). Detect or
initialize the `openspec/` tree.

**AC:**
- (a) Local-path registration succeeds only if the path is inside a server-configured
  allowlist of roots (default: the server's working dir + explicitly approved dirs).
  Out-of-allowlist paths are rejected with a structured error; approval is an admin action
  recorded in the audit log.
- (b) Remote-URL registration clones into a per-project jail dir with the full sandbox
  flag set: `--config core.hooksPath=/dev/null` (block commit hooks), `--config
  filter.*.clean= --config filter.*.smudge=` (block `.gitattributes` smudge/clean RCE),
  `--no-remote-submodules --reject-shallow`, `--no-tags`, protocol restricted to `https`
  (opt-in `git`/`ssh`), and submodules forbidden by policy. Records the origin URL;
  exposes "pull to refresh".
- (c) Duplicate registration (same absolute path or same origin URL) is rejected with the
  existing project ID.
- (d) Registration persists: project id, display name, repo path/URL, detected schema
  default, last-synced git ref, health status.

**Non-goals:** auto-discovery of all repos on disk; SSH-key management (use host's git
config); arbitrary local-path registration without allowlist.

## 1.2 Project initialization (scaffolding)

**Shall:** When a registered project lacks `openspec/`, run the equivalent of `openspec
init`: create `specs/`, `changes/`, `config.yaml`, `schemas/` (empty), and the
dashboard-private `openspec/.dashboard/` subtree, seeded with the chosen schema.

**AC:**
- (a) Resulting canonical tree passes `openspec validate` immediately after scaffold
  (verified against the NFR-5 documented rule set).
- (b) `openspec/.dashboard/` is created with a `.dashboardignore`-style marker so upstream
  `openspec validate` skips it (empirically confirmed in Phase 0 — see req 08 §8.9).
- (c) Schema choice: built-in `spec-driven` by default; user may pick any installed schema
  the server can resolve.

## 1.3 Project config CRUD

**Shall:** Read and edit `openspec/config.yaml` through a structured form AND a raw YAML
editor with live validation. Editable: default schema, context block, per-artifact rule
overrides.

**AC:**
- (a) Form fields map 1:1 to documented `config.yaml` keys; unknown keys preserved verbatim.
  **YAML round-trip property** (NOT INV-2, which is Markdown-only): the edited write
  preserves key ordering, comments, anchors/aliases outside the edited region, verified by
  a property test using a YAML AST editor (e.g. `yaml` package's CST mode), not a string
  rewrite.
- (b) Invalid YAML rejected at the editor with line/column errors; never reaches disk.
- (c) Saving writes only `config.yaml`; no collateral file churn.

## 1.4 Project health / doctor

**Shall:** Run `openspec doctor`-equivalent on demand and surface a structured report:
missing canonical dirs, invalid config, broken schema references, orphan requirements,
archive integrity. Excludes `openspec/.dashboard/` from checks.

**AC:**
- (a) Report is structured JSON + human-readable; each finding has severity, file path,
  suggested fix action.
- (b) "Apply fix" offered for safe, reversible fixes; destructive fixes require
  confirmation.

## 1.5 Project unlink / deletion (erasure-safe)

**Shall:** Unlink a project from the dashboard. Erasure purges ONLY `openspec/.dashboard/`
(dashboard-owned metadata). Canonical OpenSpec artifacts are NEVER deleted by unlink/erasure.

**AC:**
- (a) Unlink is reversible for 30 days (soft-delete tombstone in audit log + restore).
- (b) Hard-delete of a cloned remote requires typing the project name; emits audit record;
  removes the jail clone dir.
- (c) **Right-to-erasure**: purges `openspec/.dashboard/` + server-side index/audit entries
  for that project within 30 days. Canonical `openspec/specs|changes|schemas/` untouched.
- (d) The repo's canonical `openspec/` directory is never touched by unlink/delete/erasure.

## 1.6 Multi-project dashboard

**Shall:** Landing view lists all registered projects as cards: name, repo origin, active
changes count, specs count, task completion %, last activity timestamp, health badge.

**AC:**
- (a) Counts are computed from the live filesystem state within a configurable refresh
  window (default 30s). API/agent consumers receive a `Last-Modified` header so they can
  detect staleness without a focus event.
- (b) Sort + filter by health, last activity, name.
- (c) Deep-link to project detail preserves the active tab.

## 1.7 Workspace (multi-repo coordination — server-side projection)

**Shall:** Create/list/edit coordination **workspaces** that link multiple registered
projects with stable aliases and select an opener tool. Aggregates changes/tasks across
linked projects.

**AC:**
- (a) Workspace manifest is stored server-side under the dashboard-private root (NOT as an
  invented upstream file like `openspec-workspace.yaml`). CLI parity is **deferred** until
  the upstream workspace file format is confirmed (tracked task; see req 08 §8.9).
- (b) Linked-project path resolution checked on open; broken links surfaced as health
  warnings with "relpath" / "relink" actions.
- (c) Workspace doctor runs per-link checks plus cross-link consistency.

## 1.8 Context store & initiatives (server-side projection)

**Shall:** Manage **context stores** and the **initiatives** (title + summary + status) they
hold. Repo-local changes can link to an initiative.

**AC:**
- (a) Context store + initiative data is server-side projection metadata under
  `openspec/.dashboard/`. Upstream file format unconfirmed → CLI parity deferred.
- (b) Initiative CRUD with status transitions (proposed → active → completed → abandoned).
- (c) Initiative detail shows all linked changes across all repos in a unified Kanban /
  list view.

**Non-goals (deferred):** initiative-level sprint planning, capacity forecasting, CLI
consumption of initiative state.

## 1.9 Cross-cutting: project-scoped access

**Shall:** Every endpoint accepts a `projectId` and enforces the caller's role on that
project (see `09-auth-multitenancy.md`). Anonymous read is allowed only in single-user
local mode (loopback-bound).
