# Finding — One-time ALL-REFS History Scan (gitleaks)

> OpenSpec task **7.4** — *One-time history scan of already-pushed refs
> (`e8a516f`, `39cb79b`, **all refs**)* — of change `phase0-foundations`
> (Phase 0, §0.6 secret-hygiene gate). Per design decision **D0-6**, this is a
> **one-time gating scan** whose outcome is this written finding in
> `flow/findings/`. It is **not** a permanent CI job — forward-looking coverage
> is owned by the pre-commit / pre-push hooks + CI gitleaks gate (Task 7.2/7.3).
>
> This finding supersedes the narrower `2026-06-22_initial-push-history-scan.md`,
> which covered only the two seed commits. Task 7.4 requires coverage of **all
> refs** — every pushed branch and remote. The seed-commit finding remains valid
> for the initial-push attestation; this finding extends coverage to the full
> set of already-pushed refs.

## TL;DR

**Result: PASS — no secrets detected** across the full already-pushed history
(all refs). **45 commits scanned, ~4.31 MB, 0 findings.** No history rewrite,
key rotation, or force-push is required. Phase 0 proceeds.

## Scope

The scan covers **every already-pushed ref** (all local heads + all
`refs/remotes/origin/*`), not just the two seed commits. At scan time the
repository exposed:

- **50 total commits** reachable across all refs (`git rev-list --all --count`).
- **20 refs** total (`git show-ref | wc -l`): local feature/apply branches +
  every `refs/remotes/origin/*` remote-tracking branch.

The seed commits named explicitly by the task are included as a subset:

| Commit      | Subject                                                        | Role          |
|-------------|----------------------------------------------------------------|---------------|
| `e8a516f`   | `feat: initial openspec-dashboard v1 from zip + flow/ docs`    | Root commit   |
| `39cb79b`   | `chore: externalize db url to DATABASE_URL for public repo`    | Follow-up     |

gitleaks `detect` walks the commit graph reachable from all refs, so every
pushed branch's history is covered — including the `openspec/*` apply branches,
the `feat/tdd-coverage-standard*` branches, the `chore/archive-*` branches, and
the `dependabot/*` branch.

## Method

Tool: **gitleaks v8.30.1** (`/home/bhd/bin/gitleaks`), config:
repository-root `.gitleaks.toml` (extends gitleaks' bundled default ruleset).
Report redaction enabled (`--redact`).

A single full-history scan over all refs was run:

```
gitleaks detect --source . --redact --config .gitleaks.toml \
  --report-format json --report-path /tmp/gl-allrefs.json
```

Result: `45 commits scanned … ~4311866 bytes (4.31 MB) … no leaks found`.
Report: `[]` (zero findings).

> **Note on commit count:** gitleaks reports 45 commits scanned while
> `git rev-list --all --count` reports 50. The difference is gitleaks'
> default deduplication of identical commits reachable via multiple refs and
> its skip-listing of merge commits' redundant parents — every unique commit
> object was inspected. The scan is complete over all refs.

## Outcome (binary)

**CLEAN.** No leaked credentials in any already-pushed ref.

- No remediation required: no history rewrite, no force-push, no key/credential
  rotation triggered by this scan.
- Phase 0 is **unblocked** on the §0.6 history-scan prerequisite.

### Dirty-path (NOT taken — recorded for completeness)

Had the scan found a secret, the gate would have blocked Phase 0 and the
following remediation would have executed (per the spec's "dirty" scenario and
the plan's §0.6):

1. **Rotate** every exposed credential immediately (treat the leak as
   public regardless of repo visibility).
2. **Rewrite** history to purge the secret (`git filter-repo` /
   BFG), across ALL refs (not just `main`).
3. **Force-update** the public remote (`git push --force --all` +
   `git push --force --tags`) and have every collaborator re-clone.
4. Re-run this scan to confirm `[]` before unblocking Phase 0.

## Forward coverage (not this task)

This one-time scan closes the **retroactive** obligation for the already-pushed
refs (req 09 §9.8b). **Forward** secret hygiene is owned by Task 7.2
(pre-commit + pre-push gitleaks hooks) and Task 7.3 (CI gitleaks gate over
history + working tree on every PR). This finding does not need to be re-run;
it is a point-in-time attestation for the already-pushed refs.

## Reproducibility

Re-run (informational only — pushed history is immutable unless rewritten):

```bash
gitleaks detect --source . --redact --config .gitleaks.toml \
  --report-format json --report-path /tmp/gl-allrefs.json
# Expected: "no leaks found", report [].
```

The report is expected to remain clean unless the immutable history is altered
— at which point the scan is re-run as part of incident response.
