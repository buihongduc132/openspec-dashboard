# Requirements — OpenSpec Management Server (index)

Strong-voice functional requirements, derived from
`flow/intentions/2026-06-18_openspec-management-server.md` and grounded in
`flow/findings/2026-06-18_openspec-data-model.md`.

Numbering: `<group>.<requirement>`. Each requirement carries acceptance criteria (AC) and
non-goals. Non-functional requirements (NFRs) live at the bottom of this index.

## Files in this group

| # | File | Domain |
|---|------|--------|
| 01 | `01-project-workspace.md` | Project registration, config, doctor, workspaces, context stores, initiatives |
| 02 | `02-specs.md` | Spec / Requirement / Scenario **read + change-mediated mutation**, validation, search, impact, history |
| 03 | `03-changes-artifacts.md` | Change lifecycle, artifacts (proposal/design/specs/tasks), archive flow |
| 04 | `04-tasks-kanban.md` | Task projection to Kanban (Wekan/Vikunja feature set), Markdown round-trip |
| 05 | `05-schemas.md` | Schema CRUD, forking, activation, validation, template editing |
| 06 | `06-verification-quality.md` | Heuristic verification (parity clarified), validation dashboard, conflict detection |
| 07 | `07-dashboard-analytics.md` | Overview, activity timeline, coverage, velocity, archive analytics |
| 08 | `08-integration-sync.md` | CLI parity API, filesystem sync, Git/webhooks, agent JSON API |
| 09 | `09-auth-multitenancy.md` | Auth, RBAC, teams, audit log |

## Cross-cutting invariants (apply to EVERY requirement)

> Non-negotiable. If a feature violates one, the feature is wrong. **This is the complete
> set: INV-1..INV-8 plus INV-4a.** There is no INV-9/10/11; references to "INV-1..INV-11"
> elsewhere are typos and mean "INV-1..INV-8 (+INV-4a)".

- **INV-1 Filesystem is truth (canonical artifacts only).** The **canonical** OpenSpec
  artifacts (`openspec/specs/`, `openspec/changes/<name>/{proposal,design,specs,tasks}.md`,
  `openspec/schemas/`, `openspec/config.yaml`) map 1:1 to files and are never shadowed by DB
  state. **Dashboard-owned metadata** lives under a dashboard-private location (default
  `openspec/.dashboard/`; **relocated to `<repo>/.openspec-dashboard/` if §8.9 gate 1 fails**
  — see D-SidecarLoc). This location is NOT a canonical OpenSpec artifact and is explicitly
  excluded from `openspec validate` scope (req 08 §8.9). **INV-1's location claim is
  conditional on the §8.9 gate; if it fails, INV-1 still holds but the path changes.**
- **INV-2 Region-scoped byte fidelity (canonical Markdown only).** A save rewrites ONLY the
  bytes of the explicitly edited region (a task line, a requirement block, a scenario).
  No global whitespace normalization. No reformatting of untouched prose. No marker
  normalization (`*` / `1.` are preserved as-written; surfaced as validation warnings, not
  rewritten). Numbers in `tasks.md` are **display-only metadata** (see req 04 §4.1) —
  reordering or renumbering NEVER rewrites canonical Markdown numbers. **INV-2 applies to
  canonical Markdown artifacts only; `config.yaml` and other YAML files have a separate
  YAML round-trip property (req 01 §1.3).**
- **INV-3 CLI parity within the documented-rule subset.** Any state the `openspec` CLI can
  produce, the dashboard can produce; any canonical state the dashboard produces, the CLI
  can consume — **within the subset of upstream rules we can confirm from documentation +
  de-bundled source (NFR-5)**. Unconfirmed rules are tracked in a gap registry; if the
  dashboard emits state a rule rejects, that is a **bug against the registry**, not a silent
  INV-3 violation. **INV-3 is non-negotiable within the documented subset; the subset itself
  is bounded by NFR-5 and is honestly stated, not absolute.**
- **INV-4 Non-destructive, cross-session restorable.** No archive, delete, or merge is
  irreversible. Soft-delete tombstones are persisted in the audit log (not session memory),
  so restore works across sessions, server restarts, and tab closes. The only exception is
  INV-4a.
- **INV-4a Restore can be permanently blocked by conflict — explicitly documented.** An
- **INV-4a Restore can be permanently blocked by conflict — explicitly documented.** An
  archive restore that would clobber a **later-archived** change's modifications is
  permanently blocked with a structured "unrestorable" state and a recorded reason.
  Comparison key = the **archive event's monotonic sequence number** (D-ArchiveSeq), an
  ever-increasing counter that is **never reused or decremented** even across restore +
  re-archive cycles. Restore of a restored change gets a NEW, HIGHER sequence number (it is
  a new archive event). Test: `restore.targetArchive.archiveSeq < max(otherArchive.archiveSeq
  for otherArchive where intersects(otherArchive.requirementSet, targetArchive.requirementSet))`.
  This is the SOLE exception to INV-4.
- **INV-5 Dashboard metadata is mandatory for board mode; versioned; Markdown-valid without it.**
  The sidecar is REQUIRED to use Kanban/comment/due-date features (a degraded read-only
  board exists without it). Sidecar has a versioned schema. Canonical Markdown remains valid
  OpenSpec if the sidecar is deleted.
- **INV-6 Validation before write (canonical only).** No canonical artifact write reaches
  disk without passing the documented upstream `openspec validate` rule set. Dashboard
  metadata writes are validated against their own versioned schema, not OpenSpec rules.
- **INV-7 Per-section optimistic concurrency.** Mutating endpoints require `If-Match` on a
  **section-scoped ETag**. A "section" is defined per artifact type in the **Section
  Granularity Table** below. ETag = `SHA256(sectionBytes ‖ monotonicVersion)`, where
  `monotonicVersion` is a per-section counter incremented on every accepted mutation.
  **`sectionBytes` = the bytes of the section itself ONLY** (e.g. a task line's bytes; a
  requirement block's bytes) — parent blocks are NOT part of the hash, so editing two
  different task lines in the same group both succeed without invalidating each other.
  **Invalidation rule (minimal):** a mutation to section X invalidates ONLY X's ETag.
  Sibling sections and parent blocks are unaffected. Two users editing different sections
  of the same file MUST both succeed. Concurrent edits to the SAME section are rejected
  with a 409 and a merge UI (req 04 §4.24). **Create operations (POST) are exempt from
  `If-Match`** (the section does not yet exist); they use an idempotency key (req 08 §8.1).
- **INV-8 Searchable by default (canonical + dashboard entities).** Any canonical artifact
  OR dashboard entity (tasks, comments, sub-checklist items, proposals, designs) is indexed
  for full-text search within its project scope within 2s of write.

### Section Granularity Table (INV-7)

| Artifact type        | Section =                | ETag scope (bytes hashed)           |
|----------------------|--------------------------|-------------------------------------|
| `tasks.md`           | one task line            | that line's bytes only              |
| `proposal.md`        | one top-level `##` heading | that heading's body bytes         |
| `design.md`          | one ADR or one `##` heading | that heading's body bytes         |
| delta spec `.md`     | one `## <VERB> Requirement:` block | that block's bytes          |
| main spec `.md`      | one `### Requirement:` block (read-only on main — see D-MainSpecCRUD) | n/a (no writes) |
| `config.yaml`        | whole file               | whole file (single-writer mutex)    |
| `.openspec.yaml`     | whole file               | whole file (single-writer mutex)    |
| `schema.yaml`        | whole file               | whole file (single-writer mutex)    |
| schema template `.md`| whole file               | whole file                          |
| sidecar `tasks/<change>.json` | one task/comment/sub-checklist entry | that entry's bytes   |
| sidecar `comments/<uuid>.jsonl` | one comment line        | that line's bytes                   |
| sidecar `proposals/*`| one proposal record      | that record's bytes                 |

## Authority contract (Markdown vs sidecar — definitive)

| Field                  | Lives in       | Winner on conflict | Reconciliation                         |
|------------------------|----------------|--------------------|----------------------------------------|
| Task title / body      | Markdown       | Markdown           | Sidecar mirrors on read                |
| Task completion `- [x]`| Markdown       | Markdown           | Sidecar `status` derived from it       |
| Task numeric order     | Sidecar        | Sidecar            | Numbers recomputed on read; Markdown untouched |
| Assignees / labels     | Sidecar        | Sidecar            | Markdown has no equivalent             |
| Due date / priority    | Sidecar        | Sidecar            | Markdown has no equivalent             |
| Comments / sub-checks  | Sidecar        | Sidecar            | Markdown has no equivalent             |
| Requirement/scenario   | Markdown       | Markdown           | Sidecar has no equivalent              |

The **"Done" column** is identified by a stable `isDone: true` flag in the column config,
NOT by column name.

## Decisions (single source of truth — all D-* references resolve here)

| ID | Decision |
|----|----------|
| D-SidecarLoc | Dashboard metadata under `openspec/.dashboard/` by default; relocated to `<repo>/.openspec-dashboard/` if §8.9 gate 1 fails. Both paths enumerated in req 08 §8.9. |
| D-MainSpecCRUD | Direct mutation of `openspec/specs/*` is FORBIDDEN. Main specs mutate ONLY through change + archive. Req 02 §2.3/§2.4 are read + propose-via-change surfaces. |
| D-TaskID | Task IDs are UUIDs assigned in the sidecar at first-seen. Markdown numbers are display-only. |
| D-ReqID | Requirements have a stable identity layer: server-side `openspec/.dashboard/req-ids.json` mapping `(domain, name) → UUID`. **UUID assigned at first-seen** — the moment a requirement appears in any delta OR main spec, it gets a UUID recorded in `req-ids.json` immediately (not at archive time). On RENAMED, the old name's UUID transfers to the new name (identity continuity). Restore + conflict detection + impact analysis all match by UUID, not name; names are display-only. |
| D-ArchiveSeq | Every archive event gets a **monotonic archive sequence number** stored as a per-project counter in `openspec/.dashboard/archive-seq.json` (assigned atomically inside the archive mutex, persisted before the audit-log append, survives restart). The counter NEVER decrements and is NEVER reused — restore of a restored change gets a NEW higher number (it is a new archive event). This sequence is the comparison key for INV-4a. |
| D-AuditRetention | The audit log uses **archive-and-delete for erasure**, not crypto-shred. Right-to-erasure (req 09 §9.9) archives the project's full audit chain to offline storage (still verifiable via the chain hash) then deletes it from the live log. Retention expiry does the same. This is simpler than crypto-shred and avoids the plaintext-chain / ciphertext-hash contradiction. The trade-off (no partial-row deletion) is accepted. |
| D-Roundtrip | See INV-2 + Authority Contract. Markers preserved, not normalized. |
| D-Concurrency | Per-section ETags (INV-7), not file-level. |
| D-Security | Threat model required (NFR-11); see req 08 §8.10, req 09 §9.10. |
| D-Auth | Better-Auth (Lucia is deprecated — out). |
| D-BullMQ | Dropped from MVP. Redis added only when a real async job exists. |
| D-Verify | §6.1 is heuristic checks inspired by `/opsx:verify`, not parity. LLM-augmented tier is Phase 3b.4. |
| D-NFR5 | Downgraded to "documented rules" with a gap registry; upstream-source retrieval is an explicit Phase 0 task. INV-3 scoped accordingly. |
| D-SQLite | Single-user-local only; NFR-7 (≥10 concurrent) scoped to Postgres deployments. |
| D-Audit | Audit log + hash chain is Phase 0 infrastructure (not Phase 3). Every Phase 1+ mutating endpoint emits to it (NFR-10 contract-tested from Phase 0). |
| D-ETag | Per-section ETag middleware is a Phase 0.3 deliverable (INV-7 from day 1). |
| D-SchemaEditor | Visual schema form builder is Phase 3 (D5 in older drafts = D-SchemaEditor). Phase 1/2 ship raw YAML editor only. |
| D-SecretHygiene | `.gitignore` + pre-commit gitleaks + pre-push gitleaks is a **Phase 0** deliverable (already implemented in the real repo as of commit `39cb79b`). Two-person publication gate is Phase 4.4. |
| D-AutoPR | Auto-PR on archive REQUIRES `autoPush: true` (default off). There is no "auto-PR without push" — forges require the branch to exist remotely. |

## Non-functional requirements (NFRs)

| # | NFR | Target | Measurement (owner phase) |
|----|-----|--------|---------------------------|
| NFR-1 | First-contentful paint (UI) | < 1.5s cold, < 500ms warm | Lighthouse CI gate (Phase 1 onward) |
| NFR-2 | API p50/p99 (single-project read) | < 100ms / < 500ms | k6 load test in CI (Phase 1 onward); impact-analysis query cached (req 02 §2.8) |
| NFR-3 | Filesystem sync lag (disk→projection) | < 2s | Watcher probe + latency histogram (Phase 0) |
| NFR-4 | Region-scoped byte fidelity | 100% structural; untouched bytes frozen | Property-based round-trip corpus (Phase 0) |
| NFR-5 | Validator coverage | 100% of **documented** upstream rules; gaps tracked in a registry | Enumerated rule list + gap registry (Phase 0); upstream-source retrieval task (Phase 0) |
| NFR-6 | Search recall | 100% of in-scope entities indexed < 2s after write | Index-freshness probe (Phase 1) |
| NFR-7 | Concurrent editors per project (no data loss) | ≥ 10 — **Postgres deployments only** | k6 multi-user load test (Phase 3a); SQLite is single-user-local and exempt |
| NFR-8 | Public repo hygiene | Zero secrets in history | gitleaks pre-commit + pre-push + CI; two-person publication |
| NFR-9 | Accessibility | **WCAG 2.1 AA** (all SC) + **WCAG 2.2 AA** (all 5 new SC: 2.4.11 Focus Not Obscured Min, 2.5.7 Dragging Movements, 2.5.8 Target Size Minimum, 3.3.7 Redundant Entry, 3.3.8 Accessible Auth Min) on board + editors + dashboards + modals | axe-core per-component (Phase 1) **+ manual AT testing (NVDA/VoiceOver/JAWS) + keyboard-interaction scripts + visual inspection for Target Size / Focus Not Obscured**; DnD-specific manual AT in Phase 1.3; not deferred to Phase 4 |
| NFR-10 | Auditability | Every mutating canonical-artifact API call emits an immutable audit record | Audit-emission contract test on every mutating endpoint (Phase 0) |
| NFR-11 | Threat-model coverage | Every internet-facing surface has a documented threat model | Threat-model doc reviewed at Phase 0 gate |
