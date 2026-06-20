## Context

Phase 3b builds the "make OpenSpec programmable and connected" layer on top of Phase 3a (Better-Auth + RBAC) and Phase 0–2 (parser, projection, audit chain, modules). The surfaces introduced here are all internet- or process-facing: API tokens consumed by external automation, an agent JSON API consumed by AI agents, outbound webhooks reaching arbitrary operator-approved URLs, inbound webhooks receiving forge events, a git orchestration service mutating the project repo, an outbound LLM call for verification, and a richer client editor. Every one of these expands the attack surface, so the design is security-first: default-deny everywhere, confinement of untrusted inputs, and a threat-model update at the gate.

The existing app is Next.js 16 App Router + Drizzle + Postgres. The audit log (Phase 0, NFR-10) and section-scoped ETag middleware (Phase 0.3, INV-7) already exist and are reused: every mutating endpoint here emits an audit record and carries an `If-Match`. Canonical OpenSpec artifacts are never touched by agent/automation paths except through the change+archive model or the propose-for-review gate (INV-1, D-MainSpecCRUD).

## Goals / Non-Goals

**Goals:**
- Ship the seven Phase 3b capabilities scoped in the proposal with default-deny, confined, audit-logged behavior.
- Enforce D-AutoPR literally: no auto-PR without push.
- Enforce SSRF egress as default-deny with denylist-on-top and DNS pinning (not denylist-only).
- Confine agent and webhook writes to an explicit path allowlist; agents propose, humans merge canonical specs.
- Pluggable LLM verifier that reuses the heuristic finding model and degrades safely.
- Two-pane schema editor that is round-trip safe and respects whole-file ETag concurrency.
- All code built TDD-first; cite `testing-standard` (INV-9 / NFR-12) for the coverage gates rather than restating them.

**Non-Goals:**
- Auth, RBAC, users, teams-as-org-structure — owned by Phase 3a. Phase 3b only adds API tokens and trust-boundary enforcement, which assume users exist.
- A multi-node agent mesh, agent companies, or mission orchestration (the `sidebar-agent-console` change owns in-dashboard agent streaming; Phase 3b owns only the programmatic JSON API surface).
- Bundling a geo-IP database (operator-supplied via `GEOIP_SOURCE`).
- E2E browser tests (separate concern; integration here = API/route/integration tests against a real or in-memory DB).
- Rewriting the heuristic verifier (Phase 2 owns it; Phase 3b only adds the LLM tier beside it).

## Decisions

### D1: Wrap the system `git` binary; do not add a git library
**Decision:** Git integration shells out to the system `git` binary with `cwd = project rootPath` and a tightly-scoped argument allowlist. No new runtime git library dependency.

**Why:** `git` is already a hard dependency of OpenSpec workflows (the project repos are git repos). The binary is battle-tested for merge/conflict semantics that libraries re-implement poorly. Argument scoping avoids shell injection (no `--upload-pack`, no `-c`, paths validated against the repo root).

**Alternatives:** `isomorphic-git` / `simple-git` (rejected — partial merge support, larger surface to audit, drift from real git behavior), libgit2 bindings (rejected — native build complexity).

### D2: Auto-PR is a single transaction gated on autoPush, with partial-failure recording
**Decision:** When `autoPush: true` and a change archives, the system performs commit → push → open-PR as one logical transaction. If push succeeds but the forge PR call fails, the pushed branch is recorded as "pushed, PR pending" and the user can retry the PR step. There is no code path that opens a PR without a prior push (D-AutoPR enforced structurally — the PR function requires a push receipt as an argument).

**Why:** D-AutoPR is non-negotiable; making the PR function depend on a push receipt argument makes it impossible to call "auto-PR without push" by construction, not by convention.

**Alternatives:** Best-effort PR after a timer (rejected — race-prone, hides failures), two-phase manual (rejected — violates the "one transaction" expectation when the feature is on).

### D3: SSRF egress filter is allowlist ⊕ denylist with connection-time DNS pinning
**Decision:** Egress check = (target in operator allowlist) AND (resolved IP not in denylist). DNS is resolved once, the IP is pinned, and the TCP connection is made to the pinned IP (with the original Host header). Redirects are re-checked against the same filter and rejected if they land in a denylisted range. Denylist = RFC1918, 169.254/16, 100.64/10, 169.254.169.254, fd00:ec2::254, loopback. IPv6-mapped-IPv4 and decimal/octal/hex IP literals are normalized before comparison.

**Why:** Denylist-only is insecure (DNS rebinding, IPv6-mapped-IPv4, redirect chains, alternate IP literal encodings). Allowlist-only without a denylist lets a misconfiguration reach internal networks. The combination with pinning closes the rebinding window.

**Alternatives:** Denylist-only (rejected by the requirements — explicitly insecure), a separate SSRF proxy (rejected — overengineered for this scale; the filter is a library function reused by the webhook dispatcher).

### D4: API tokens hashed at rest; plaintext shown once
**Decision:** Tokens are generated server-side, hashed (SHA-256 + per-token salt) before storage, and the plaintext is returned exactly once at creation. Leak detection stores only fingerprint buckets (origin-IP, user-agent hash, geo **median** of hashed token uses), never the plaintext. Per req 09 §9.5(c), the actionable detection (alert + temporary rate-limit pending reconfirmation) is a **conjunction**: a token is flagged when BOTH a novel fingerprint bucket (not seen in prior 30 days) AND geographic implausibility (>2000km from the **median** — deliberately chosen over centroid/mean for outlier robustness — of the last 50 uses) are true simultaneously. This AND gating is load-bearing: users legitimately rotate networks/VPNs/update browsers (novel-fingerprint alone would spam false alerts), and travelers move geographically (geo-alone would auto-rate-limit legitimate travel). The conjunction suppresses both false-positive classes. The sole exception is the cold-start path (<5 uses), where geo is exempt and novel-fingerprint alerting alone fires (alert only, no rate-limit) per §9.5(c).

**Why:** A DB read should never recover a usable token. One-time plaintext display matches industry convention (GitHub PATs) and limits blast radius of a DB compromise.

**Alternatives:** Symmetric encryption at rest (rejected — recoverable, and the system never needs to recover a token, only verify one), plaintext (rejected — unacceptable).

### D5: Trust-boundary enforcement is a single middleware ahead of route handlers
**Decision:** One middleware runs before every agent/webhook route handler: it resolves the token, loads the project's trust-boundary config, checks the path against the allowlist glob set, checks the HTTP verb, checks the write-rate limiter, and on any denial logs a security event to the audit log and rejects. The middleware is the single chokepoint — route handlers never re-implement these checks.

**Why:** A single chokepoint makes default-deny the actual default (a new route forgets to opt into the allowlist → denied), and keeps the security-critical logic in one audited place. This directly satisfies req 09.10 AC (a) "enforced in middleware."

**Alternatives:** Per-route guards (rejected — easy to forget on a new route = hole), decorator-based (rejected — same forgettability).

### D6: LLM verifier is an adapter behind the existing verifier interface
**Decision:** The Phase 2 verifier has a tier interface (`verify(change) → Findings[]`). The LLM tier is a new adapter implementing that interface, composed via a per-project config flag. Malformed LLM output is caught and degraded to heuristic-only — the combined verifier never crashes because of the LLM.

**Why:** Reusing the finding model keeps the validation dashboard uniform (req 06.3) and makes the LLM tier additive, not a fork. Safe degradation is required because LLM output is non-deterministic.

**Alternatives:** Separate LLM-only dashboard (rejected — fragments the UX), strict LLM output schema with hard failure (rejected — one bad LLM reply blocks archiving in advisory mode, violating req 06.1(c)).

### D7: Schema editor uses whole-file ETag (schema files are single-writer)
**Decision:** Per the Section Granularity Table, `schema.yaml` is whole-file single-writer. The visual editor save sends an `If-Match` over the whole file; out-of-band edits are detected via the same ETag mismatch and surfaced with the merge/reload UI. Two-way binding is computed client-side from a single parsed AST; the YAML source is the single source of truth, the visual form is a projection.

**Why:** Reusing the existing whole-file ETag machinery (no new concurrency primitive) keeps INV-7 consistent. YAML-as-source-of-truth avoids the "two editors disagree" problem — the visual pane is always a render of the YAML.

**Alternatives:** Per-key ETags for schema (rejected — the granularity table already decided whole-file), a separate visual-only model synced on save (rejected — divergence risk).

### D8: Inbound webhook idempotency via event-id table; HMAC constant-time compare
**Decision:** Inbound webhook handlers store processed event-ids in a Drizzle table with a unique constraint; duplicates hit the constraint and are acknowledged without reprocessing. HMAC comparison uses `crypto.timingSafeEqual`. Multiple active secrets are tried in order during the rotation grace window.

**Why:** Unique-constraint dedup is race-free under concurrent duplicate delivery (the DB serializes it). Constant-time compare defeats timing oracles. Trying active secrets in order supports the documented rotation policy without downtime.

**Alternatives:** In-memory dedup set (rejected — lost on restart, multi-instance unsafe), single secret (rejected — no rotation path).

## Risks / Trade-offs

- **[Shell injection via git args]** Wrapping `git` risks argument injection. → Strict allowlist of subcommands; every path argument resolved and validated to be inside the repo root (no `..`, no absolute escape); no shell interpolation (execFile with arg array, never a shell string). Tested with a property-based injection corpus.
- **[LLM cost runaway]** A misconfigured or loop-happy LLM tier could run up cost. → Per-run token cap, per-project daily cap, timeout per run, and cost recorded on every report (req 06.1d); admin can disable per-project.
- **[SSRF allowlist drift]** Operators may over-permit the allowlist. → Denylist is enforced on top regardless (defense in depth); the threat model documents that allowlist entries are a trust decision; audit log records egress allowlist changes.
- **[Geo-IP cold-start false negatives]** New tokens (<5 uses) bypass the geographic signal. → Acknowledged trade-off in req 09.5(c): for <5-use cold-start tokens, novel-fingerprint alerting fires alone (alert only, no rate-limit) since the AND conjunction cannot be satisfied without geo data. For ≥5-use tokens, the conjunction (novel fingerprint AND geo-implausible) suppresses false positives from legitimate network rotation or travel. When `GEOIP_SOURCE` is unset the conjunction path is disabled for all tokens; cold-start novel-fingerprint alerting continues. Documented so cold-start is not mistaken for zero coverage.
- **[Trust-boundary middleware as a single point]** If the middleware has a bug, every route is affected. → The middleware is the most heavily unit-tested component in this phase (path globbing, verb matrix, rate limiter) with adversarial property tests; it is also the simplest path to audit precisely because there is only one.
- **[Schema two-way binding parse edge cases]** Unusual YAML (anchors, multiline strings) can desync the visual form. → Visual form is a projection of a single parse; on any parse ambiguity the YAML pane wins and the form shows a "raw view" fallback; round-trip property tests on a schema fixture corpus.
- **[Auto-PR partial-failure orphan branches]** A push that succeeds but PR that fails leaves a remote branch. → Recorded as "pushed, PR pending" with a retry affordance; never silently lost; cleanup task documented in tasks.md.
- **[Commit-on-save failure leaves disk↔projection desync]** A git commit that fails AFTER the canonical save already wrote bytes to disk must not roll the projection back to a stale state (INV-1: filesystem is truth). → On commit failure the projection stays synced to the persisted file (the save succeeded, the file IS the canonical state); the commit failure is recorded as a non-fatal git-integration error and the user is notified the change is saved-but-not-committed. The save is never undone by a commit failure.
- **[Trust-boundary default rate ambiguity]** A forward-reference ("see design") in the spec is not testable. → The spec pins the literal default (60 writes/min per req 09.10) so a "61st write in a sliding minute fails" test is unambiguous.
