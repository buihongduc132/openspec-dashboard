## Why

Phase 1–2 deliver a single-user local tool: loopback-bound, no auth, one implicit user. Phase 3a turns that into a real multi-user system so a team can share a dashboard deployment — distinct identities, per-project roles, and the multi-repo coordination surfaces (workspaces, context stores, initiatives) that need an authenticated actor to be meaningful. Without it, the dashboard cannot be deployed beyond one developer's laptop, and the cross-repo conflict detection (req 06.5) has no owner context.

## What Changes

- **Better-Auth integration** (D-Auth — Lucia is deprecated, out): email/password (argon2id), OAuth (GitHub, Google) with PKCE, httpOnly secure-cookie sessions, CSRF protection on state-changing endpoints, optional TOTP MFA (required for the admin role). Local loopback mode (req 9.1) remains the default no-auth path.
- **RBAC**: per-project roles **Owner / Editor / Viewer** (req 9.3), deny-by-default checks on every endpoint, owner transfer requiring current-owner confirmation, optional anonymous read-only public sharing link per project.
- **Teams + session invalidation** (req 9.4): group users into teams with team-level project roles; invite by email with expiry + single-use tokens; a `roleVersion` session stamp forces immediate role reload on team/role changes (active WebSocket connections get a `roles-changed` event and must re-auth).
- **Rate limiting & abuse protection** (req 9.7): per-token and per-IP limits on mutating endpoints, burst protection on auth endpoints, `429` with `Retry-After` + reason. (Agent-token budget distinctness is Phase 3b — agent tokens themselves do not exist until 3b.)
- **Workspaces** (req 1.7): server-side multi-repo coordination surface linking registered projects with stable aliases + opener selection; aggregates changes/tasks across links; broken-link health warnings; workspace doctor.
- **Context stores + initiatives** (req 1.8): server-side projection under the dashboard-private root; initiative CRUD with status transitions (proposed → active → completed → abandoned); unified cross-repo initiative view.
- **Cross-repo consistency** (req 6.5): exact-signature conflict detection across a workspace's linked repos; conservative matching, near-matches surfaced as "review candidates" only; fixture-corpus false-positive gate.
- **Audit right-to-erasure** (req 9.9 full): per-project archive-and-delete (D-AuditRetention) — Phase 0 located the sidecar + audit partitioning; Phase 3a completes the erasure workflow (deletion request → tracked → completion within 30 days, backups honored). Canonical OpenSpec artifacts are NEVER touched.

## Capabilities

### New Capabilities

- `authentication`: Better-Auth email/password + OAuth (PKCE), session cookies, CSRF, optional TOTP MFA (required for admin); local loopback no-auth mode preserved.
- `rbac`: Per-project Owner/Editor/Viewer roles, deny-by-default enforcement on every endpoint, owner transfer, optional anonymous read-only public link.
- `teams-session-invalidation`: Team grouping, team-level project roles, email invites (expiry + single-use), `roleVersion`-based immediate session reload + WebSocket `roles-changed` event.
- `rate-limiting`: Per-token and per-IP limits on mutating endpoints, auth-endpoint burst protection, `429` with `Retry-After` + reason.
- `workspaces`: Server-side multi-repo coordination — link projects with aliases, opener selection, cross-project aggregation, broken-link health, workspace doctor.
- `context-stores-initiatives`: Server-side context stores + initiatives (status transitions), unified cross-repo initiative view; CLI parity deferred.
- `cross-repo-consistency`: Exact-signature conflict detection across workspace-linked repos, conservative matching, fixture-corpus false-positive gate.
- `audit-erasure`: Per-project right-to-erasure completing the Phase 0 audit partitioning (archive-and-delete per D-AuditRetention), 30-day completion tracking, backup honoring; canonical artifacts untouched.

### Modified Capabilities
The `workspaces`, `context-stores-initiatives`, and related tables ALREADY EXIST in `src/db/schema.ts` (created as Phase 1 scaffolding during the v3 merge: `workspaces`, `workspace_links`, `context_stores`, `initiatives`). Phase 3a does NOT recreate them — it EXTENDS them with auth-owner columns and the fields the new specs require. Because `openspec/specs/` is empty (no archived formal specs), the requirements are still `## ADDED Requirements` (first formal spec), but the Data section below calls out the migrations explicitly to avoid a false "greenfield" claim.

## Impact

- **Code**: New `src/lib/auth/` (Better-Auth wiring), `src/lib/rbac/` (role checks + middleware), `src/lib/rate-limit/`, extended `src/db/schema.ts` (users, sessions, accounts/OAuth, teams, team_memberships, project_roles, invites, mfa, rate-limit counters; PLUS non-destructive column additions on the EXISTING `workspaces`, `workspace_links`, `context_stores`, `initiatives` tables), new App Router routes (`/login`, `/admin`, `/teams`, `/workspaces`, `/context-stores` enriched, `/initiatives`), middleware for auth + RBAC + rate-limit + session invalidation, WebSocket layer for `roles-changed`.
- **APIs**: New auth endpoints (Better-Auth-managed), project-role endpoints, team/invite endpoints, workspace/context-store/initiative CRUD, cross-repo conflict query, erasure request endpoints. Every existing endpoint gains a `projectId` RBAC check (req 1.9).
- **Dependencies**: `better-auth` (+ `argon2`, its OAuth providers), a rate-limit store (in-process for single-instance Phase 3a; Redis deferred until a real multi-instance need). No agent/webhook/token tooling (Phase 3b).
- **Data**: Migrations for the new auth/RBAC/team tables above, PLUS non-destructive extensions to existing tables (NOT recreations): `workspaces.ownerUserId` (FK → users, nullable for backfill), `context_stores.ownerUserId` + `context_stores.workspaceId` (nullable, backfilled), `initiatives.status varchar DEFAULT 'proposed' NOT NULL` (required by the status-transition spec but ABSENT from the current table), `initiatives.updatedAt` (absent). No existing column is dropped; existing rows backfilled with defaults (`status='proposed'`, owner = first admin). Per-project audit partitioning already exists (Phase 0); 3a adds the erasure workflow over it.
- **Docs**: Deployment docs warn Docker `-p` binds `0.0.0.0`; threat model (NFR-11) updated for auth/RBAC/team/session/aggregation surfaces. NFR-7 (≥10 concurrent editors) load-tested here on Postgres.
- **Systems**: None beyond the app. No Redis in 3a (D-BullMQ — deferred until a real async job exists).
