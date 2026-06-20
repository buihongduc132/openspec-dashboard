## 1. Testing standard hookup (cites `testing-standard`)

- [ ] 1.1 Confirm the Phase 3b code paths inherit the project's `testing-standard` gates (unit + integration Vitest projects, coverage instrumentation ON, knip dead-code gate); do not re-create tooling owned by `tdd-coverage-standard`
- [ ] 1.2 Add an integration-test fixture: a project with a git repo (testcontainer or temp dir) + a registered token, reused by the capability test groups below

## 2. API tokens (`api-tokens`)

- [ ] 2.1 Write failing tests for token creation with step-up auth (happy + missing-step-up rejected) — RED
- [ ] 2.2 Implement token creation route: generate, hash (SHA-256 + salt) at rest, return plaintext once, audit-log
- [ ] 2.3 Write failing tests for scope enforcement (read token vs write, project A vs project B) — RED
- [ ] 2.4 Implement scope-check middleware for token-authenticated requests; reject + audit-log violations
- [ ] 2.5 Write failing tests for revocation (immediate invalidation, non-owned token 404) — RED
- [ ] 2.6 Implement revocation endpoint + last-used timestamp update on every use
- [ ] 2.7 Write failing tests for leak detection — conjunction model per §9.5(c): (novel-fingerprint AND geo-implausible >2000km from **median**) → alert + rate-limit (≥5 uses, cold-start 5–49 uses all-available median); novel-fingerprint-alone → alert only (NO rate-limit) for <5-use cold-start; novel-alone with ≥5 uses → NO alert (conjunction not satisfied); geo-alone with ≥5 uses → NO alert (conjunction not satisfied); `GEOIP_SOURCE` missing disables conjunction path, cold-start novel alerting continues — RED
- [ ] 2.8 Implement leak-detection job: 24h fingerprint buckets, conjunction detection (novel-fingerprint AND geo-median-implausible for ≥5-use tokens → alert + rate-limit + reconfirmation flow), cold-start <5-use novel-fingerprint-only alert (no rate-limit), operator-supplied geo-IP via `GEOIP_SOURCE` (no bundled DB); reconfirmation clears rate-limit
- [ ] 2.9 Write failing tests for last-used timestamp tracking (updated on every authenticated request, queryable by owner) — RED
- [ ] 2.10 Implement last-used timestamp persistence + update on every token-authenticated request

## 3. Trust-boundary enforcement (`trust-boundary-enforcement`)

- [ ] 3.1 Write failing tests for default-deny + glob matching (exact, recursive `**`, non-match) — RED
- [ ] 3.2 Implement the trust-boundary middleware (single chokepoint ahead of agent/webhook routes): path allowlist glob match, verb check, write-rate sliding-window limiter
- [ ] 3.3 Write failing tests for violation audit logging + rate-limit 429 — RED
- [ ] 3.4 Implement security-event audit emission on every denial; 429 on rate-limit breach
- [ ] 3.5 Write failing tests for trust-boundary config load (valid + invalid glob → default-deny fallback) — RED
- [ ] 3.6 Implement per-project trust-boundary config loader with validation and default-deny fallback; confirm `openspec/.dashboard/proposals/` is NOT in the default allowlist
- [ ] 3.7 Adversarial property tests for the glob matcher (injection/escape patterns, normalization edge cases)

## 4. Git integration (`git-integration`)

- [ ] 4.1 Write failing tests for commit-on-save (enabled structured commit, disabled default no-op, git-failure keeps projection synced to disk per INV-1 + surfaces saved-but-not-committed) — RED
- [ ] 4.2 Implement git orchestration service: `execFile('git', args)` with `cwd=rootPath`, arg allowlist, path-confined validation (no `..`, no absolute escape); commit message `chore(openspec): <verb> <entity>`
- [ ] 4.3 Write failing tests for branch-per-change (creation no-push, disabled default) — RED
- [ ] 4.4 Implement branch-per-change (`<prefix>/<change-name>`, configurable prefix, no push)
- [ ] 4.5 Write failing tests for auto-PR gating on `autoPush` (on = commit+push+PR; off = commit only, no PR; PR function requires push receipt; configurable target branch default `main`) — RED
- [ ] 4.5a Write failing test that the PR-opening function cannot be called without a push receipt (structural enforcement of D-AutoPR)
- [ ] 4.6 Implement auto-PR transaction; on forge-PR failure after push, record "pushed, PR pending" for retry
- [ ] 4.7 Write failing tests for merge-conflict surfacing (no-conflict fast-forward, conflict → merge UI not silent fail) — RED
- [ ] 4.8 Implement pull/merge with conflict detection → merge UI
- [ ] 4.9 Write failing test that PR state is stored in dashboard metadata only and is CLI-invisible — RED
- [ ] 4.10 Property tests for the git arg/path injection corpus

## 5. Webhooks (`webhooks`)

- [ ] 5.1 Write failing tests for SSRF egress default-deny (empty allowlist blocks, allowlist+denylist interaction, allowlist public allowed, IPv6-mapped-IPv4 normalization + IPv6 ULA/link-local denied) — RED
- [ ] 5.1a Write failing tests for outbound domain-event enumeration (exactly: change created, artifact edited, change archived, validation failed; unsubscribed event does not fire) — RED
- [ ] 5.2 Implement SSRF egress filter: allowlist ⊕ denylist (RFC1918/169.254/100.64/cloud-metadata/loopback, IPv6 ULA fc00::/7, IPv6 link-local fe80::/10), IP-literal normalization (IPv6-mapped-IPv4 ::ffff:0:0/96 → IPv4 form, decimal/octal/hex)
- [ ] 5.3 Write failing tests for DNS pinning + redirect rejection (rebinding defeated, redirect to denylisted blocked) — RED
- [ ] 5.4 Implement connection-time DNS pinning + redirect re-check
- [ ] 5.5 Write failing tests for outbound delivery (success, 5xx retry+backoff, dead-letter after max, HMAC signature present) — RED
- [ ] 5.6 Implement outbound webhook dispatcher: HMAC-signed payload + timestamp, exponential backoff, dead-letter queue
- [ ] 5.7 Write failing tests for inbound HMAC verification + rotation (valid active secret, invalid rejected, rotated secret in grace window, constant-time) — RED
- [ ] 5.8 Implement inbound webhook receiver: `timingSafeEqual`, multiple active secrets, rotation grace window
- [ ] 5.9 Write failing tests for idempotent event handling (duplicate event-id ignored, novel processed) — RED
- [ ] 5.10 Implement event-id dedup via unique-constraint table
- [ ] 5.11 Write failing tests for per-project admin-gated webhook config — RED
- [ ] 5.12 Implement webhook config endpoints (admin-gated, audit-logged)

## 6. Agent JSON API (`agent-api`)

- [ ] 6.1 Write failing tests for read endpoints (project state dense JSON, change full context, HTML accept header still returns JSON) — RED
- [ ] 6.2 Implement agent read endpoints (dense, no pagination artifacts)
- [ ] 6.3 Write failing tests for sandboxed task writes (within allowlist ok, outside rejected, `config.yaml` without grant rejected) — RED
- [ ] 6.4 Implement agent task-write endpoints behind the trust-boundary middleware; return new section ETag (INV-7)
- [ ] 6.5 Write failing tests for propose-delta-for-review (creates pending artifact, returns preview URL, direct canonical write rejected, approve merges, reject leaves untouched) — RED
- [ ] 6.6 Implement propose-delta endpoint → `openspec/.dashboard/proposals/`; human approve/reject flow (approve merges subject to INV-6 validation)
- [ ] 6.7 Write failing test that every agent write emits an audit record (hashed token, action, path) — RED
- [ ] 6.8 Wire audit emission into agent write paths (NFR-10)

## 7. LLM verifier (`llm-verifier`)

- [ ] 7.1 Write failing tests for the verifier-tier interface (LLM enabled = heuristic+LLM combined; disabled = heuristic-only; provider unconfigured = fallback+warning) — RED
- [ ] 7.2 Implement LLM verifier adapter behind the Phase 2 verifier tier interface; per-project enable flag
- [ ] 7.3 Write failing tests for finding-model conformance + malformed-output safe degradation — RED
- [ ] 7.4 Implement output parser → finding model; on parse failure discard LLM output, log, return heuristic-only
- [ ] 7.5 Write failing tests for cost/latency recording + timeout fallback — RED
- [ ] 7.6 Implement token-usage + latency capture on the report; per-run timeout → heuristic fallback
- [ ] 7.7 Write failing tests for advisory vs required mode (req 06.1c parity) — RED
- [ ] 7.8 Confirm LLM tier inherits the `verify.required` blocking policy without changing it

## 8. Visual schema editor (`schema-visual-editor`)

- [ ] 8.1 Write failing tests for two-way binding (visual→YAML, YAML→visual) — RED
- [ ] 8.2 Implement two-pane editor; YAML as single source of truth, visual form as projection from one parse
- [ ] 8.3 Write failing tests for out-of-band edit detection + stale-ETag 409 merge UI — RED
- [ ] 8.4 Implement whole-file `If-Match` save + out-of-band detection → merge/reload UI
- [ ] 8.5 Write failing tests for round-trip safety (unknown YAML keys preserved, comments/ordering preserved) — RED
- [ ] 8.6 Implement region-safe serialization preserving YAML-only keys verbatim (INV-2)
- [ ] 8.7 Write failing tests for live validation + save-blocked-on-error — RED
- [ ] 8.8 Implement inline validation in both panes; block save on errors (INV-6)
- [ ] 8.9 Round-trip property tests on a schema fixture corpus (anchors, multiline, comments)

## 9. Cross-cutting

- [ ] 9.1 Extend the OpenAPI 3.1 spec with all new endpoints (req 08.1); mutating endpoints carry `If-Match` (INV-7)
- [ ] 9.2 Update the threat model (req 08.10) for every new surface (agent path-confinement, inbound forgery/replay, outbound SSRF, token theft, auto-PR forge creds); reviewed at the Phase 3b gate
- [ ] 9.3 Confirm no new runtime dep was added without design justification (system `git`, Node fetch, operator geo-IP file)

## 10. Verification (milestone 3b)

- [ ] 10.1 `npm run test:coverage` passes the `testing-standard` unit coverage gate for Phase 3b code
- [ ] 10.2 `npm run test:integration:coverage` passes the `testing-standard` integration coverage gate (instrumentation ON) for Phase 3b code
- [ ] 10.3 `npm run knip` reports no dead code in Phase 3b additions
- [ ] 10.4 `npm run typecheck` and `npm run lint` clean on changed files
- [ ] 10.5 `npm run build` succeeds
- [ ] 10.6 Verifier-loop milestone: 2 fresh blind verifiers confirm the seven capabilities meet their specs, edge cases are covered, no overengineering, and threat-model surfaces are mitigated; APPROVE before phase close
