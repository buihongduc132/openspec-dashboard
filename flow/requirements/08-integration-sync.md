# Requirements 08 — Integration, Sync, API

> The "make OpenSpec programmable" surface. INV-1, INV-3, INV-6, INV-7 apply. Threat model
> in §8.10.

## 8.1 REST API (CLI parity)

**Shall:** Expose a REST API with one endpoint per CLI verb: project register/init, spec
read + propose-via-change, change CRUD, artifact CRUD, archive, validate, schema CRUD,
doctor. Workspace/context-store endpoints are server-side projection (CLI parity deferred
per req 01 §1.7/§1.8).

**AC:**
- (a) OpenAPI 3.1 spec generated and versioned; breaking changes bump the major version.
- (b) Every mutating endpoint requires a **section-scoped `If-Match` ETag** (INV-7) and
  returns the new ETag.
- (c) Idempotency keys supported on create operations.

## 8.2 Filesystem sync (disk → server)

**Shall:** Watch the registered repo's `openspec/` tree (chokidar) and refresh the server's
projection within 2s of any disk change (NFR-3). Watcher ignores the dashboard-private
`openspec/.dashboard/` subtree for canonical-projection purposes (but DOES watch it for
sidecar-driven UI updates).

**AC:**
- (a) Watcher survives file moves, deletes, bulk git operations (checkout, pull).
- (b) Debounced batch updates to avoid thrash on `git pull` touching many files.
- (c) Out-of-band edits (user edits Markdown in `$EDITOR`) are detected and reconciled via
  the §4.21 reconciliation algorithm; low-confidence rebindings surfaced, never silently
  dropped.

## 8.3 Filesystem sync (server → disk)

**Shall:** Every server-side mutation writes the corresponding canonical file(s) atomically
(write-temp + rename). Dashboard metadata writes go to `openspec/.dashboard/` atomically.

**AC:**
- (a) Atomic writes; watcher ignores its own writes via an in-process marker.
- (b) Write failure rolls back the in-memory projection and returns a 5xx with the partial
  state description.

## 8.4 Git integration

**Shall:** Per-project optional Git integration: commit-on-save (configurable), one branch
per change (configurable), auto-PR on archive (configurable target branch).

**AC:**
- (a) Commit messages structured (`chore(openspec): <verb> <entity>`), machine-parseable.
- (b) Branch-per-change creates `<prefix>/<change-name>`; **push is always explicit and
  user-initiated**. "Auto-PR on archive" REQUIRES `autoPush: true` (default off) — there is
  no "auto-PR without push" mode, because forges (GitHub/GitLab/forgejo) cannot open a PR
  for a branch that was never pushed. With `autoPush: false` (default), archive commits to
  the change's local branch only; the user pushes manually when ready. With `autoPush:
  true`, archive commits + pushes + opens a PR via the configured forge API in one
  transaction.
- (c) Conflict on `git pull` surfaces a merge UI rather than failing silently.
- (d) PR state is **dashboard-only**; it is NOT in CLI-parity scope (the CLI cannot consume
  PR state and that is by design).

## 8.5 Webhook integration (SSRF-hardened)

**Shall:** Outbound webhooks on domain events (change created, artifact edited, change
archived, validation failed). Inbound webhooks for Git events triggering auto-validate.

**AC:**
- (a) Outbound: HMAC-signed payload, retry with exponential backoff, dead-letter queue,
  **SSRF egress filter default-deny**: the default egress allowlist is **empty** (all
  outbound blocked); the operator explicitly adds permitted egress targets. A denylist
  (block RFC1918, link-local 169.254/16, CGNAT 100.64/10, cloud metadata
  `169.254.169.254` / `fd00:ec2::254`, loopback) is enforced on top of the allowlist to
  catch misconfiguration. Denylist-only is insecure (DNS rebinding, IPv6-mapped-IPv4,
  decimal/octal/hex IP literals, redirect chains) and is NOT the default.
- (b) Inbound: HMAC verification with **documented rotation policy** (support N active
  secrets, versioned signatures), idempotent event handling (event-id dedup).
- (c) Webhook config per-project, admin-gated.

## 8.6 Agent JSON API (sandboxed writes)

**Shall:** A documented JSON API optimized for AI agent consumption: read project state,
read a change's full context, create/update tasks (within the agent's scoped project +
path allowlist), propose a delta spec for review.

**AC:**
- (a) Endpoints return dense, agent-friendly JSON (no HTML, no pagination artifacts).
- (b) Write endpoints require a **scoped API token** with a project + path-allowlist + role
  matrix (see req 09 §9.10). Agents CANNOT write outside the allowlisted paths; cannot
  touch `config.yaml` unless explicitly granted.
- (c) "Propose delta spec" is a **write** that creates a pending-review artifact under
  `openspec/.dashboard/proposals/`; the human reviewer approves before it merges into the
  change's canonical delta spec. Returns a preview URL.

## 8.7 Bidirectional Markdown sync contract (definitive)

**Shall:** Documented contract: see the Authority Contract table in `README.md`. Markdown
wins on title/body/completion; sidecar wins on metadata; structural mismatch triggers the
§4.21 reconciliation (not a modal prompt spam).

**AC:**
- (a) Contract versioned; breaking changes require a migration.
- (b) "Done" identified by stable `isDone` flag, not column name.

## 8.8 Export / backup

**Shall:** Export an entire project's state (canonical filesystem snapshot + dashboard
metadata + audit log) as a versioned tarball. Restore imports into a fresh project
registration.

**AC:**
- (a) Tarball includes a manifest with server version + schema versions.
- (b) Restore validates against the current server version before applying.

## 8.9 Upstream-format empirical gates (Phase 0)

**Shall:** Phase 0 MUST empirically confirm:

1. **Sidecar coexistence**: that `openspec validate` ignores `openspec/.dashboard/` (a
   dot-prefixed dir) and any sidecar files. **Binary success criteria**: "ignore" means
   "the file is not traversed and produces zero validation findings" — partial-ignore
   (traversed-but-skipped) is a FAILURE. **Pre-committed fallback location** if it fails:
   `<repo>/.openspec-dashboard/` (outside `openspec/` entirely). The full list of
   affected path strings under each branch: INV-1 location claim, req 1.2(b)/1.5/4.1/4.15/
   4.16/5.4/8.3/8.6/8.8/9.8/9.9 all switch from `openspec/.dashboard/` to
   `<repo>/.openspec-dashboard/` atomically via a single config constant. No design
   amendment needed beyond the constant.
2. **Workspace / context-store formats**: obtain the actual upstream file format (clone the
   repo, read source) before claiming CLI parity. Until then, these remain server-side
   projections (req 01 §1.7/§1.8).
3. **`schema fork` output**: confirm whether upstream records fork provenance in-band; if
   yes, align; if no, keep dashboard-side provenance (req 05 §5.4).
4. **Upstream parser source**: attempt to obtain `src/lib/schema.ts` via `npm install
   openspec` / clone + de-bundle, to close the NFR-5 gap registry.

**AC:**
- (a) Each gate produces a written finding committed under `flow/findings/`.
- (b) Any gate that fails its assumption triggers a documented design amendment, not a
  silent workaround.

## 8.10 Threat model (required, NFR-11)

**Shall:** Maintain a living threat-model document covering every internet-facing surface:
project registration (path traversal, clone RCE), agent write API (path-confinement,
privilege escalation), inbound webhooks (forgery, replay), outbound webhooks (SSRF),
multi-tenant data isolation (cross-tenant read/write), public-repo publication (secret
leak), auth (token theft, session fixation).

**AC:**
- (a) Each surface has: assets, adversaries, attack tree, mitigations, residual risk.
- (b) Reviewed at the Phase 0 gate and at every phase that adds a new surface.
