# Requirements 09 — Auth, Multi-Tenancy, Audit

> Optional for single-user local mode; required for multi-user. **Audit log is Phase 0
> infrastructure** (per plan), not Phase 3 — it is depended on by INV-4, NFR-10, and many
> Phase 1–2 requirements.

## 9.1 Single-user local mode (default)

**Shall:** Run with no auth when bound to loopback only. All endpoints assume the single
local user.

**AC:**
- (a) Server refuses to bind to non-loopback interfaces in local mode without explicit
  opt-in (`--bind 0.0.0.0` requires `--allow-network`).
- (b) A clear banner in the UI states "local mode — no auth".
- (c) Container deployment docs warn that Docker `-p` binds `0.0.0.0` by default and
  require explicit `127.0.0.1:` prefix for local mode.

## 9.2 User authentication (multi-user mode)

**Shall:** Email/password + OAuth (GitHub, Google). Session via httpOnly secure cookies;
CSRF protection on state-changing endpoints.

**AC:**
- (a) Password storage uses argon2id; never plaintext or unsalted hashes.
- (b) OAuth flows use PKCE; tokens never logged.
- (c) MFA available (TOTP) — required for admin role.

## 9.3 Project permissions (RBAC)

**Shall:** Per-project roles: **Owner**, **Editor**, **Viewer**. Role assignment is
per-project.

**AC:**
- (a) Permission checks on every endpoint; deny-by-default.
- (b) Owner transfer requires current-owner confirmation.
- (c) Anonymous public sharing (read-only link) optional per project.

## 9.4 Team management (with session invalidation)

**Shall:** Group users into teams; assign team-level project roles. Invite by email with
expiry + single-use token.

**AC:**
- (a) Invite tokens expire (default 7 days) and are single-use.
- (b) Team membership / role changes propagate to derived project roles **immediately** via
  a session-version stamp: every session carries a `roleVersion`; the server tracks the
  current `roleVersion` per user; on mismatch, the session is force-reloaded (re-fetch
  roles) on the next request. Active WebSocket connections receive a `roles-changed` event
  and must re-auth.

## 9.5 API tokens (with defined leak detection)

**Shall:** Per-user API tokens with project scope + role scope. Revocable; last-used
timestamp tracked.

**AC:**
- (a) Tokens are scoped (project X, role Editor); never global admin by default.
- (b) Token creation requires re-auth (step-up auth).
- (c) **Leak detection algorithm (defined)**: a rolling 24h window tracks per-token
  (origin-IP, user-agent) fingerprint buckets. If a token is used from a fingerprint bucket
  not seen in the prior 30 days AND geographically implausible given the prior median
  (>2000km from median of last 50 uses), an alert is sent to the owner and the token is
  temporarily rate-limited pending reconfirmation. **Cold-start**: for tokens with <50
  uses, the median is computed over all available uses (minimum 5); tokens with <5 uses are
  exempt from geographic implausibility (only novel-fingerprint alerting applies). Geo-IP
  source: **operator-provided** — the operator configures a geo-IP database URL or local
  file path via `GEOIP_SOURCE` env var (e.g. a licensed MaxMind GeoLite2 download, or an
  open alternative like DB-IP / IP2Location LITE); the server does NOT bundle any geo-IP
  database in the public repo.

## 9.6 Audit log (Phase 0 — immutable, hash-chained, with a verifier)

**Shall:** Immutable, append-only audit log of every mutating canonical-artifact API call:
actor, action, entity, before/after content hash, timestamp, request IP, user-agent.

**AC:**
- (a) Audit log stored separately from project data; **tamper-evident via a hash chain**
  (each entry's `prevHash = SHA256(prevEntryHash || entryBody)`). **Single-writer append**:
  a per-project serial append queue ensures no two concurrent appends read the same
  `prevHash`; concurrent mutating endpoints enqueue their audit record and the writer
  drains serially. **`entryBody` schema is defined**: `{actor, action, entity,
  beforeHash, afterHash, timestamp (UTC, ms), requestId (UUID)}` — the timestamp +
  requestId make same-body different-time entries distinct in the hash.
- (b) A **chain verifier** runs on every read of the audit log AND as a scheduled job; any
  broken link is a CRITICAL alert with a defined incident response: the server enters
  **read-only quarantine** (mutating endpoints return 503), the broken entry is isolated,
  and an operator is paged. The verifier is unit-tested against tampered fixtures.
- (c) Retention configurable (default 1 year); **retention = archive-then-delete**
  (D-AuditRetention): when the retention window expires, entries are moved to a cold
  archive (chain hash preserved for compliance), then deleted from the live log. The cold
  archive's chain is independently verifiable. Exportable for compliance.
- (d) Searchable by actor, entity, action, time range.
- (e) **Emitted from Phase 0**: every mutating endpoint has an audit-emission contract test
  (NFR-10) gating Phase 1.
- (f) **Multi-tenant purge reconciliation**: the audit log is append-only at the chain
  level within a retention window; per-project right-to-erasure (req 01 §1.5, req 09 §9.9)
  is satisfied by **per-project partitioning + archive-and-delete** (D-AuditRetention) —
  each project has its own audit-log file (chain). Erasure archives that project's chain
  to offline storage (chain hash preserved for compliance) then deletes it from the live
  log. Retention expiry does the same. Other projects' chains are untouched.

## 9.7 Rate limiting & abuse protection

**Shall:** Per-token and per-IP rate limits on mutating endpoints. Burst protection on auth
endpoints. **Agent tokens share the same limiter** with a distinct, lower default budget.

**AC:**
- (a) Limits configurable per deployment.
- (b) 429 responses include `Retry-After` and a clear reason.

## 9.8 Secret hygiene (repo-publication gate)

**Shall:** Before any code/configuration reaches the public repository, a secret scan
(gitleaks or equivalent) MUST pass. Pre-commit + pre-push hooks; CI gate.

**AC:**
- (a) `.gitignore` excludes: `.env*`, `*.key`, `*.pem`, `secrets/`, `auth.json`,
  `config.local.yaml`, `openspec/.dashboard/` (contains user data), server DB files,
  anything carrying API keys.
- (b) Secret scan covers git history (not just working tree); rewrite history if found.
- (c) Public-repo publication is a manual, logged, two-person step (not automated).

## 9.9 Data residency & deletion (sidecar-aware)

**Shall:** Per-project canonical data lives under that project's repo path. Dashboard-owned
metadata lives under `openspec/.dashboard/` (or a server-side dir if §8.9 gate 1 forces
relocation). Right-to-erasure: deleting a project purges dashboard-owned metadata +
server-side index/audit entries within 30 days; **canonical OpenSpec artifacts are NEVER
touched** by erasure.

**AC:**
- (a) Deletion request logged and tracked to completion.
- (b) Backups honoring the same deletion window.

## 9.10 Agent & webhook trust boundary

**Shall:** Maintain an explicit trust-boundary matrix for agent tokens and inbound
webhooks. Defined fields:

- **path allowlist**: glob patterns (e.g. `openspec/changes/*/tasks.md`,
  `openspec/.dashboard/**`). Default deny; every grant explicit. **`openspec/.dashboard/
  proposals/` is NOT in the default allowlist** — agents must be explicitly granted write
  to propose delta specs.
- **allowed-verbs**: HTTP verbs (`GET`, `POST`, `PATCH`, `DELETE`). Default deny.
- **max-write-rate**: units = **writes per minute** per token; default 60/min, configurable.
- **phase scoping**: enforcement middleware ships in **Phase 3b** (when agent API +
  webhooks ship); AC (b) below does not apply before 3b.

**AC:**
- (a) Matrix documented in the threat model (req 08 §8.10) and enforced in middleware.
- (b) Boundary violations are audit-logged as security events and rate-limited.

**Non-goals (Phase 0–3a):** no agent/webhook surfaces exist, so no enforcement needed.
