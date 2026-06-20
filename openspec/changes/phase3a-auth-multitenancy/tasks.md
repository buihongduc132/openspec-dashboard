## 1. Schema migrations (TDD-first)

- [ ] 1.1 Write failing Drizzle migration tests asserting the NEW tables exist with expected columns: `users`, `sessions`, `accounts` (OAuth), `teams`, `team_memberships`, `project_roles` (userId, projectId, role), `invites`, `mfa_credentials`, `rate_limit_buckets`, `deletion_requests`
- [ ] 1.2 Write failing migration tests asserting NON-DESTRUCTIVE column additions on EXISTING tables (these tables already exist from Phase 1 — do NOT recreate): `workspaces.ownerUserId` (FK → users, nullable), `context_stores.ownerUserId` + `context_stores.workspaceId` (nullable), `initiatives.status varchar DEFAULT 'proposed' NOT NULL` (ABSENT today — required by the status-transition spec), `initiatives.updatedAt` (ABSENT today). Assert no existing column is dropped and existing rows backfill with defaults
- [ ] 1.3 Implement the Drizzle schema additions + column extensions in `src/db/schema.ts` + the migration; run tests green
- [ ] 1.4 Write integration test (testcontainers Postgres) that applies the migration on a fresh DB AND on a DB pre-seeded with the Phase 1 schema (to prove the column additions are non-destructive), asserts a round-trip insert/select per table; confirm line coverage collected (instrumentation ON)

## 2. Authentication (Better-Auth)

- [ ] 2.1 Write failing unit tests for the local-mode guard: loopback bind starts no-auth; non-loopback bind without `--allow-network` refuses; UI banner state
- [ ] 2.2 Implement the local-mode guard + `--allow-network` flag + banner; tests green
- [ ] 2.3 Write failing tests for email/password: argon2id storage, valid login, wrong-password generic error, no plaintext ever persisted
- [ ] 2.4 Wire Better-Auth email/password plugin with argon2id + Drizzle adapter; tests green
- [ ] 2.5 Write failing tests for OAuth (PKCE): GitHub + Google round-trips mocked at the provider boundary; token redaction in logs
- [ ] 2.6 Implement OAuth providers via Better-Auth PKCE plugin + log redaction; tests green
- [ ] 2.7 Write failing tests for session cookie attributes (HttpOnly/Secure/SameSite) and CSRF rejection of state-changing requests without a valid token
- [ ] 2.8 Implement cookie config + CSRF middleware; tests green
- [ ] 2.9 Write failing tests for TOTP: user opt-in enrollment; admin grant/login blocked without TOTP
- [ ] 2.10 Implement TOTP plugin + admin-must-have-MFA check; tests green
- [ ] 2.10a Write failing tests for MFA recovery codes: generated at enrollment (hashed, shown once), valid unused code unlocks login, single-use revocation, reused-code rejected, admin lockout recoverable
- [ ] 2.10b Implement recovery-code generation + redemption (single-use, audit-logged) + hashed storage; tests green
- [ ] 2.11 Integration test: full signup → login → authenticated request → logout against testcontainers DB, coverage ON

## 3. RBAC

- [ ] 3.1 Write failing unit tests for effective-role resolution (direct ∪ team-inherited) and deny-by-default
- [ ] 3.2 Implement `resolveEffectiveRole(userId, projectId)` pure function; tests green
- [ ] 3.3 Write failing tests for `requireProjectRole` middleware: Editor write OK, Viewer write 403, no-role 403, all denials audit-logged
- [ ] 3.4 Implement the middleware; tests green
- [ ] 3.5 Write failing tests for owner transfer (confirmed vs unconfirmed) and anonymous read-only public link (enabled vs default-disabled 401)
- [ ] 3.6 Implement owner transfer + public-link toggle; tests green
- [ ] 3.7 Write a meta-test asserting every project-scoped route under `src/app/api/projects/[id]/**` and `src/app/api/tasks/**` is wrapped by `requireProjectRole`; unwrapped routes fail CI
- [ ] 3.8 Retrofit the wrapper onto all existing project-scoped endpoints; meta-test green

## 4. Teams + session invalidation

- [ ] 4.1 Write failing tests for team role inheritance and removal propagation
- [ ] 4.2 Implement team grouping + team-level project roles + effective-role union (extends 3.2); tests green
- [ ] 4.3 Write failing tests for invites: valid accept, expired reject, reused reject
- [ ] 4.4 Implement email invites with expiry + single-use tokens; tests green
- [ ] 4.5 Write failing tests for roleVersion: stale stamp triggers re-resolve and enforces new role; privileged request under new lower role rejected without data loss
- [ ] 4.6 Implement `roleVersion` stamp + mismatch re-resolve in the auth middleware; tests green
- [ ] 4.7 Write failing tests for WebSocket `roles-changed` event on role/team change + client re-auth requirement
- [ ] 4.8 Implement the WebSocket event emission + client re-auth gate; tests green
- [ ] 4.9 Integration test: admin demotes a user mid-session; next request by that user is denied under the new role, coverage ON
- [ ] 4.10 Write failing tests for effective-role precedence decision table: higher-team-role-overrides-lower-direct, direct-Owner-preserved, no-role deny (extends 3.1/4.1); tests green

## 5. Rate limiting

- [ ] 5.1 Write failing unit tests for the token-bucket: under-limit accept, over-limit 429 with `Retry-After` + reason, configurable values
- [ ] 5.2 Implement the in-process per-token + per-IP token-bucket limiter (D-3a4); tests green
- [ ] 5.3 Write failing tests for auth-endpoint burst protection (login + invite-accept probing throttled)
- [ ] 5.4 Apply stricter auth-burst limits on auth endpoints; tests green
- [ ] 5.5 Write failing tests asserting every 429 carries `Retry-After` + a reason identifying the limit
- [ ] 5.6 Wire the limiter into the middleware chain; tests green

## 6. Workspaces

- [ ] 6.1 Write failing tests for workspace create + link (aliases, opener) stored server-side; assert NO file written into linked projects' `openspec/` trees (INV-1)
- [ ] 6.2 Implement workspace CRUD + linking under the dashboard-private root; tests green
- [ ] 6.3 Write failing tests for cross-project aggregation (changes/tasks across links, labeled by alias) including the empty-workspace state AND the RBAC filter applied as a structural `project_roles` join (deny-by-default at the DB layer): caller sees only links where they hold ≥Viewer; no-role links withheld — no cross-project data leak; a query path that omits the join cannot return no-role data
- [ ] 6.4 Implement the aggregated workspace view with per-project RBAC filtering; tests green
- [ ] 6.5 Write failing tests for broken-link health warnings (relpath/relink actions) and workspace doctor (duplicate alias, clean run)
- [ ] 6.6 Implement health warnings + workspace doctor; tests green

## 7. Context stores + initiatives

- [ ] 7.1 Write failing tests that initiatives persist under the dashboard-private root and are NOT written into any project canonical tree (INV-1)
- [ ] 7.2 Implement initiative storage as server-side projection; tests green
- [ ] 7.3 Write failing tests for initiative status transitions: proposed→active OK, completed→proposed rejected, abandoned removed from active views
- [ ] 7.4 Implement initiative CRUD + transition validation + audit logging; tests green
- [ ] 7.5 Write failing tests for the unified cross-repo initiative view (changes from multiple repos labeled) including the no-links empty state AND tenant isolation: changes from repos the caller has no role on are omitted entirely (no title/metadata), filtered by a structural `project_roles` join not post-fetch
- [ ] 7.6 Implement the unified initiative view; tests green
- [ ] 7.7 Write failing tests for context-store/initiative mutation authorization: Editor-on-linked-project OK, Viewer-only rejected 403, unauthenticated 401
- [ ] 7.8 Implement the authorization gate on context-store/initiative CUD; tests green

## 8. Cross-repo consistency

- [ ] 8.1 Write failing unit tests for signature normalization and exact-match conflict detection vs near-match review candidates; assert no auto-merge
- [ ] 8.2 Implement the exact-signature matcher + near-match review-candidate surfacing; tests green
- [ ] 8.3 Build/curate the Phase 3a fixture corpus of requirement signatures; write the false-positive gate test that fails if precision/recall miss the threshold and publishes the numbers
- [ ] 8.4 Write failing tests for dismiss-false-positive (audit-logged) and sort-by-repo-pair
- [ ] 8.5 Implement dismissal + audit logging + sortable conflict view; tests green
- [ ] 8.6 Write failing tests for the recompute trigger (write/archive recomputes), computedAt staleness labeling, and mid-sync repo handling (wait or stale-label, no compute over half-synced repo)
- [ ] 8.7 Implement the recompute trigger + staleness labeling + mid-sync guard; tests green
- [ ] 8.8 Write failing integration tests for tenant isolation of the conflict comparison set: a user with Viewer on repo A but no role on repo B gets zero signatures parsed/indexed/returned from B (no data leak); cross-workspace scope does not leak a repo visible in W1 into W2
- [ ] 8.9 Implement the structural `project_roles` join filter in the comparison-set query (deny-by-default at the DB layer, not post-fetch); prove via test that a query path omitting the join cannot return B's data; tests green

## 9. Audit right-to-erasure

- [ ] 9.1 Write failing tests that erasure archives the project's dashboard metadata + audit partition to cold storage (chain hash preserved), deletes from live, and leaves canonical artifacts untouched (INV-1) and other projects' chains intact
- [ ] 9.2 Implement the archive-and-delete erasure workflow over the Phase 0 per-project partitioning (D-3a7); tests green
- [ ] 9.3 Write failing tests for tracked deletion completion + backups honoring the deletion window
- [ ] 9.4 Implement deletion-request tracking + backup-window honoring; tests green
- [ ] 9.5 Write a test asserting the cold archive chain is independently verifiable after erasure
- [ ] 9.6 Write failing tests for erasure authorization: Owner/admin accepted, Editor/Viewer rejected 403, unauthenticated 401
- [ ] 9.7 Implement the erasure authorization gate + audit of the requesting actor; tests green
- [ ] 9.8 Write failing tests for erasure concurrency: write during erasure rejected/queued (not applied to archived data), write after erasure rejected (project re-registration required)
- [ ] 9.9 Implement the erasure in-flight write guard + post-erasure rejection; tests green

## 10. Cross-cutting + verification

- [ ] 10.1 Cite the `testing-standard` capability in any test-plan doc; confirm every task above has its test-first step (INV-9)
- [ ] 10.2 Run `npm run test:coverage` (unit) and confirm Phase 3a code exceeds the unit line-coverage gate; address gaps
- [ ] 10.3 Run `npm run test:integration:coverage` with instrumentation ON; confirm Phase 3a code exceeds the integration line-coverage gate
- [ ] 10.4 Run `npm run knip` and confirm no dead code added by Phase 3a
- [ ] 10.5 Run NFR-7 k6 multi-user load test (Postgres) for ≥10 concurrent editors; record results
- [ ] 10.6 Update the threat model (NFR-11) for auth/RBAC/team/session/public-link surfaces
- [ ] 10.7 Update deployment docs: Docker `-p` binds `0.0.0.0` warning; `127.0.0.1:` prefix for local mode
- [ ] 10.8 Verifier-loop milestone 3a: 2 fresh blind verifiers confirm coverage + dead-code + edge-case coverage before approval
