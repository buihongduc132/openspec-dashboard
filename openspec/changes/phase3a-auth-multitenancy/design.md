## Context

Phases 0–2 deliver a single-user local tool: loopback-bound, no auth, one implicit user, every endpoint assuming the local operator. Phase 3a turns this into a shareable multi-user system. The dashboard already has a working App Router + Drizzle + Postgres stack, a per-project audit log with hash chaining (Phase 0, §9.6), and the canonical-filesystem-truth model (INV-1). The missing layer is identity: who is calling, what they may do on which project, and the coordination surfaces (workspaces, context stores, initiatives, cross-repo conflict) that only become meaningful once there is an authenticated actor.

Constraints: Better-Auth (D-Auth — Lucia deprecated). No agent/webhook/API-token surfaces (those are Phase 3b). No Redis (D-BullMQ — deferred). Existing invariants must hold: INV-1 (filesystem truth — workspaces/initiatives live server-side, never as invented upstream files), INV-4/4a (archive restorable), INV-7 (per-section ETag unaffected by auth), INV-9 (TDD-first, coverage gates, no dead code — see `testing-standard` capability, cited not restated).

## Goals / Non-Goals

**Goals:**
- A real multi-user deployment path: Better-Auth email/password + OAuth (PKCE), secure sessions, CSRF, optional TOTP (required for admin).
- Per-project RBAC (Owner/Editor/Viewer), deny-by-default, on every existing endpoint.
- Teams + immediate role propagation via a `roleVersion` session stamp + WebSocket `roles-changed`.
- Rate limiting (per-token + per-IP mutating, auth burst) with informative `429`s.
- Workspaces, context stores, initiatives as server-side projections.
- Cross-repo exact-signature conflict detection with a fixture-corpus false-positive gate.
- Complete the audit right-to-erasure (archive-and-delete) that Phase 0 partitioned for.
- Keep local loopback no-auth mode as the default.

**Non-Goals:**
- API tokens / leak detection / agent + webhook trust boundary (Phase 3b — req 9.5, 9.10).
- Git integration, webhooks, agent API, LLM verifier, visual schema editor (Phase 3b).
- Redis-backed rate limiting or job queues (deferred per D-BullMQ until a real multi-instance need).
- Initiative sprint planning / capacity forecasting (req 1.8 non-goals).
- CLI consumption of workspace/initiative state (deferred until upstream formats confirmed).
- Anonymous write access (only read-only public link is supported).

## Decisions

### D-3a1: Better-Auth as the single auth framework
**Decision:** Use Better-Auth for sessions, email/password, OAuth providers, and the account-linking model. Passwords via argon2id through Better-Auth's plugin.

**Why:** D-Auth mandates Better-Auth (Lucia deprecated). Better-Auth ships httpOnly cookie sessions, OAuth with PKCE, and a Drizzle adapter — matching our stack with no bespoke session code.

**Alternatives:** Hand-rolled session + argon2 (rejected — D-Auth forbids), NextAuth/Auth.js (different model, weaker Drizzle fit), Lucia (deprecated).

### D-3a2: RBAC as middleware, not decorator sprawl
**Decision:** A single `requireProjectRole(minRole)` middleware reads `projectId` from the route, resolves the caller's effective role (direct + team-inherited), and enforces deny-by-default. Every project-scoped route passes through it.

**Why:** One enforcement point = no endpoint accidentally left open. Effective-role resolution (direct ∪ team) lives in one pure function, unit-testable in isolation.

**Alternatives:** Per-handler role checks (rejected — easy to forget on new endpoints), DB-level RLS (rejected — Postgres-only, hides logic from app, conflicts with Drizzle queries).

### D-3a3: roleVersion stamp for immediate invalidation
**Decision:** Each session carries a `roleVersion`. A per-user `currentRoleVersion` counter increments on any role/team change. The auth middleware compares; on mismatch it re-resolves roles and updates the session's stamp before proceeding. An open WebSocket pushes a `roles-changed` event.

**Why:** Immediate propagation without short session TTLs (which hurt UX) or per-request DB role lookups on every endpoint (the stamp is cheap to compare; full resolution only on mismatch).

**Alternatives:** Short session TTL (rejected — UX friction), per-request full role load (rejected — NFR-2 read-latency cost), JWT with roles baked in (rejected — can't revoke without a denylist).

### D-3a4: In-process rate limiter (no Redis) for Phase 3a
**Decision:** A token-bucket limiter in process memory, keyed per-token and per-IP. Limits configurable via env.

**Why:** Single-instance is the Phase 3a deployment reality; D-BullMQ/Redis is deferred until a real multi-instance need. In-process is simple, testable, and has no new infra.

**Alternatives:** Redis-backed (rejected — D-BullMQ, no current need), Postgres-backed counters (rejected — write amplification on every request).

### D-3a5: Workspaces + context stores + initiatives are Postgres-backed dashboard entities
**Decision:** Workspaces, workspace links, context stores, and initiatives live as dashboard-owned rows in the EXISTING Postgres tables (`workspaces`, `workspace_links`, `context_stores`, `initiatives` in `src/db/schema.ts`), NOT as invented upstream files and NOT under the task/comment sidecar location (`openspec/.dashboard/`). Phase 3a adds non-destructive columns for the auth/RBAC layer (`workspaces.ownerUserId`, `context_stores.ownerUserId` + `context_stores.workspaceId`, `initiatives.status` + `initiatives.updatedAt`); it does not recreate these tables. No file is written into a linked project's canonical `openspec/` tree.

**Why:** INV-1 (filesystem is truth for canonical artifacts only) forbids inventing upstream files; req 1.7/1.8 explicitly defer CLI parity until upstream formats are confirmed. But these entities already have Postgres tables from the Phase 1 scaffold, and INV-5 reserves the sidecar (`openspec/.dashboard/`) for task/comment/proposal metadata — not for workspaces/initiatives. The honest reconciliation is: Postgres = the dashboard-owned store for these coordination entities; canonical `openspec/` = untouched; sidecar = task/comment metadata only.

**Alternatives:** Invented `openspec-workspace.yaml` (rejected — breaks INV-1 / CLI parity); sidecar JSON under `openspec/.dashboard/` (rejected — conflates with INV-5 task metadata and loses relational query capability the cross-repo initiative view needs); drop the existing tables and re-store as files (rejected — loses existing data + relational joins).

### D-3a6: Exact-signature cross-repo matching, fixture-gated
**Decision:** Cross-repo conflict matching uses the exact normalized signature `(domain, lowercased-kebab-name, scenario-heading-hashes, RFC-2119-strength-set)`. Near-matches are review candidates only. A fixture corpus gates the false-positive rate before ship.

**Why:** req 6.5 mandates conservative exact matching. Auto-merging near-matches would corrupt specs across repos. The corpus gate makes "conservative" measurable, not aspirational.

**Alternatives:** Fuzzy/semantic matching (rejected — req 6.5 forbids auto-merge), name-only matching (rejected — high false positive).

### D-3a7: Erasure completes Phase 0 partitioning via archive-and-delete
**Decision:** Erasure archives the project's dashboard metadata + its per-project audit partition to cold storage (chain hash preserved for compliance), then deletes from live. No crypto-shred. Canonical artifacts untouched. Tracked to completion within 30 days; backups honor the window.

**Why:** D-AuditRetention already decided archive-and-delete over crypto-shred (avoids the plaintext-chain/ciphertext-hash contradiction). Phase 0 partitioned the audit log per-project exactly to make this operation safe to other projects' chains.

**Alternatives:** Crypto-shred (rejected — D-AuditRetention), delete canonical artifacts (rejected — req 9.9 forbids).

### D-3a8: TDD via the shared `testing-standard` capability
**Decision:** All Phase 3a code follows the project-wide TDD discipline owned by the `testing-standard` capability (openspec change `tdd-coverage-standard`; INV-9 / D-TDD / NFR-12). This design cites that standard and does not restate its thresholds.

**Why:** INV-9 / D-TDD / NFR-12 — single source of truth; restating the numbers here would violate the `testing-standard` "cited, not duplicated" requirement and create drift risk. The per-phase verifier-loop gate checks the standard's thresholds for Phase 3a's code.

**Alternatives:** Phase-specific coverage rules (rejected — duplication, drift).

### D-3a9: Extend existing tables, never recreate (table-collision resolution)
**Decision:** The `workspaces`, `workspace_links`, `context_stores`, `initiatives`, and `audit_logs` tables ALREADY EXIST in `src/db/schema.ts` (from the initial Phase 1 scaffold / Phase 0). Phase 3a SHALL NOT issue `CREATE TABLE` for any of them. Phase 3a issues only: (a) `CREATE TABLE` for genuinely new auth/RBAC tables (`users`, `sessions`, `accounts`, `teams`, `team_memberships`, `project_roles`, `invites`, `mfa_secrets`, `mfa_recovery_codes`, `rate_limit_counters`); and (b) non-destructive `ALTER TABLE ... ADD COLUMN` on the existing tables for the auth-owner / status fields the new specs require (`workspaces.ownerUserId`, `context_stores.ownerUserId` + `context_stores.workspaceId`, `initiatives.status` DEFAULT `'proposed'`, `initiatives.updatedAt`). No existing column is dropped; existing rows are backfilled with defaults.

**Why:** A migration that `CREATE TABLE workspaces` against a database where `workspaces` already exists will fail (table already exists) and block the entire Phase 3a deploy. The existing scaffold created these tables structurally (basic CRUD columns); Phase 3a adds the auth/RBAC layer over them, it does not reinvent their storage.

**Alternatives:** Drop-and-recreate (rejected — data loss, violates INV-4); rename old tables (rejected — unnecessary churn, breaks existing queries).

## Risks / Trade-offs

- **[In-process rate limiter resets on restart]** A restart clears the buckets, allowing a brief burst. → Acceptable in Phase 3a single-instance; document it. Mitigated by auth-endpoint burst protection being conservative. Multi-instance moves this to Redis in a later phase.
- **[roleVersion race]** A role change landing between the stamp check and the handler execution could let a just-revoked action through for one request. → Acceptable (one-request staleness, deny-by-default on next request); a distributed lock would cost more than it saves at this scale.
- **[Better-Auth OAuth provider breakage]** GitHub/Google OAuth API changes can break login. → Provider abstraction via Better-Auth's plugin model; contract tests mock the provider; degraded-path surfaces a clear error rather than a crash.
- **[Cross-repo corpus not representative]** A weak fixture corpus makes the false-positive gate meaningless. → Corpus is versioned and expanded during Phase 3a; the gate number is published with the change so it is auditable, not hidden.
- **[Erasure vs. backups]** Backups taken before erasure completes could restore erased data. → Backups honor the deletion window (aged out or filtered on restore); documented as an explicit task, not assumed.
- **[Public read-only link abuse]** An leaked public link exposes read-only project data. → Default off; link is revocable; surfaced in project settings; threat-model note (NFR-11) updated. No write path.
- **[Every endpoint needs the RBAC pass]** Retrofitting `requireProjectRole` onto all existing endpoints is mechanical but error-prone. → A meta-test asserts every project-scoped route is wrapped; unwrapped routes fail CI.
