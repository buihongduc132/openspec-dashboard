## Why

Phases 0–3a delivered a single-user, single-project dashboard with auth and RBAC. Phase 3b is the "make OpenSpec programmable and connected" layer: it lets external systems and AI agents read/write the dashboard safely (scoped API tokens + sandboxed agent JSON API + a hardened trust boundary), connects changes to a forge (git integration with auto-PR), fires domain events to the outside world (SSRF-hardened webhooks), and adds the two pieces deferred from earlier phases — a pluggable LLM verifier tier (req 06.1d) and the visual schema editor (req 05.5, D-SchemaEditor). Without it the dashboard is an island: no agent automation, no CI/forge loop, no outbound automation, and verification stays heuristic-only.

## What Changes

- **API tokens (req 09.5):** per-user, project-scoped, role-scoped tokens with last-used tracking, revocation, and step-up-auth creation. Includes the defined leak-detection algorithm (24h rolling fingerprint buckets, geographic implausibility with cold-start handling) backed by an operator-configured geo-IP source (`GEOIP_SOURCE`).
- **Trust-boundary enforcement middleware (req 09.10):** default-deny path allowlist (glob), allowed HTTP verbs, per-token max-write-rate (default 60/min), with violations audit-logged as security events and rate-limited. Enforcement ships here because that is when agent/webhook surfaces first exist. `openspec/.dashboard/proposals/` is NOT in the default allowlist.
- **Git integration (req 08.4):** per-project optional commit-on-save, branch-per-change, and auto-PR-on-archive. **BREAKING constraint: auto-PR REQUIRES `autoPush: true` (default off)** — there is no "auto-PR without push" because a forge cannot open a PR for an unpushed branch (D-AutoPR). Commit messages are structured and machine-parseable. Merge conflicts on pull surface a merge UI.
- **Webhooks (req 08.5):** outbound domain-event webhooks (HMAC-signed, retry + backoff, dead-letter) with **SSRF egress default-deny** (empty allowlist, denylist on top covering RFC1918 / link-local / CGNAT / cloud metadata / loopback, plus DNS pinning to defeat rebinding); inbound Git webhooks with HMAC verification, documented rotation policy, and idempotent event handling. Default-deny, never denylist-only.
- **Agent JSON API (req 08.6):** dense agent-friendly JSON endpoints (read project state, read a change's full context, create/update tasks within a scoped path allowlist, propose a delta spec for human review). "Propose delta spec" creates a pending-review artifact under `openspec/.dashboard/proposals/` and returns a preview URL; agents cannot merge canonical specs directly.
- **LLM verifier tier (req 06.1d):** a pluggable verifier backend that calls a configured LLM for `/opsx:verify`-grade reasoning, enabled per-project with cost/latency surfaced, sitting alongside the Phase 2 heuristic tier.
- **Visual schema editor (req 05.5, D-SchemaEditor):** two-pane visual form + raw `schema.yaml` editor with two-way binding, live validation, out-of-band-edit conflict detection, and round-trip-safe preservation of YAML-only keys.
- All of the above is built TDD-first and cites the `testing-standard` capability (INV-9 / NFR-12) rather than restating thresholds; a verifier-loop milestone (§3b.6) gates the phase.

## Capabilities

### New Capabilities
- `api-tokens`: per-user scoped tokens (project + role), revocation, last-used tracking, step-up-auth creation, and the leak-detection algorithm with cold-start handling (req 09.5).
- `trust-boundary-enforcement`: default-deny middleware enforcing path allowlist, allowed verbs, and max-write-rate for agent tokens and inbound webhooks; violations audit-logged and rate-limited (req 09.10).
- `git-integration`: per-project optional commit-on-save, branch-per-change, and auto-PR-on-archive gated on `autoPush: true` (req 08.4, D-AutoPR).
- `webhooks`: SSRF-default-deny outbound domain-event webhooks and HMAC-verified inbound Git webhooks with rotation policy and idempotent handling (req 08.5).
- `agent-api`: dense agent-friendly JSON API for reads + sandboxed task writes + propose-delta-for-review (req 08.6).
- `llm-verifier`: pluggable LLM verifier backend, per-project enablement, cost/latency surfaced (req 06.1d).
- `schema-visual-editor`: two-pane visual + YAML schema editor with two-way binding and round-trip safety (req 05.5, D-SchemaEditor).

### Modified Capabilities
<!-- openspec/specs/ is empty (greenfield). No existing main specs to modify. -->

## Impact

- **Code**: new API routes under `src/app/api/` (tokens, agent reads/writes, webhooks inbound, git actions, schema editor save, llm verify); a trust-boundary enforcement middleware; git orchestration service (wrapping `git` CLI in the project `rootPath`); outbound webhook dispatcher + SSRF egress filter; LLM verifier adapter; visual schema editor client component. Server + client components per existing patterns.
- **APIs**: new REST endpoints (token CRUD, agent read/write, webhook config + inbound receiver, git operations, llm verify trigger, schema editor save). OpenAPI 3.1 spec extended (req 08.1). Mutating endpoints carry section-scoped `If-Match` ETags (INV-7) and audit-log emissions (NFR-10).
- **Dependencies**: a git client (use the system `git` binary; no new runtime dep unless a library is justified in design); HTTP client for outbound webhooks + forge APIs (Node fetch); optional LLM SDK chosen in design; geo-IP reader (operator-supplied DB file, not bundled). No geo-IP database ships in the public repo.
- **Data**: new Drizzle tables for API tokens (hashed at rest), webhook configs, outbound-webhook delivery/dead-letter records, agent proposals (pending-review). No changes to canonical OpenSpec artifacts (INV-1).
- **Systems**: outbound webhook egress must respect a configurable allowlist (ops concern); LLM verifier calls an external provider (latency/cost); git operations execute against the project's local repo.
- **Security**: threat model (req 08.10) updated for every new internet-facing surface (agent write API path-confinement, inbound webhook forgery/replay, outbound SSRF, token theft). Reviewed at the Phase 3b gate.
