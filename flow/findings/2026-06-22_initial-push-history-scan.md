# Finding — Initial-Push History Scan (retroactive gitleaks)

> OpenSpec task **1.13** — *Initial-push history scan (retroactive gitleaks on
> `e8a516f` + `39cb79b`)* — of change `build-openspec-dashboard-mvp` (Phase 0,
> §0.6 secret-hygiene gate). Per design decision **D0-6**, this is a **one-time
> gating scan** whose outcome is this written finding in `flow/findings/`. It is
> **not** a permanent CI job — forward-looking coverage is owned by the pre-commit
> / pre-push hooks + CI gitleaks gate (task 1.12).

## TL;DR

**Result: PASS — no secrets detected** in the initial-push history
(`e8a516f` → `39cb79b`). No history rewrite, key rotation, or force-push is
required. The public repo (`https://github.com/buihongduc132/openspec-dashboard`)
contains no leaked credentials in the scanned range.

## Scope

The repository's *initial push* to the public remote consisted of two commits:

| Commit      | Subject                                                        | Role          |
|-------------|----------------------------------------------------------------|---------------|
| `e8a516f`   | `feat: initial openspec-dashboard v1 from zip + flow/ docs`    | Root commit   |
| `39cb79b`   | `chore: externalize db url to DATABASE_URL for public repo`    | Follow-up     |

`e8a516f` is the repository root (`git rev-list --max-parents=0`), and
`39cb79b` is its only descendant at the time of the initial push. The full
initial-push history is therefore these two commits; everything reachable from
them is covered by this scan.

## Method

Tool: **gitleaks v8.30.1** (`/home/bhd/bin/gitleaks`), config:
repository-root `.gitleaks.toml`. Report redaction enabled (`--redact`).

Two complementary scans were run to cover both the root commit's full tree and
the incremental diff, because gitleaks `detect` cannot express a range that
*includes* a parent-less root commit via the `A..B` revision selector.

1. **Root commit `e8a516f` — full tree (`gitleaks dir`)**
   A detached worktree was checked out at `e8a516f` and scanned in `dir` mode
   (scans every file in the snapshot, not just a diff):
   ```
   gitleaks dir -c .gitleaks.toml --redact \
     --report-format json --report-path gl-e8a516f.json <worktree@e8a516f>
   ```
   Result: `scanned ~236139 bytes … no leaks found`. Report: `[]`.

2. **Follow-up commit `39cb79b` — incremental diff (`gitleaks detect`)**
   The diff between the root and `39cb79b` was scanned in commit-patch mode:
   ```
   gitleaks detect --source . --log-opts="e8a516f..39cb79b" \
     --redact --report-format json --report-path gl-39cb79b.json
   ```
   Result: `1 commits scanned, ~216 bytes … no leaks found`. Report: `[]`.

Both report files contain an empty JSON array — zero findings.

## Outcome

- **No leaked credentials** in `e8a516f` or `39cb79b`.
- **No remediation required**: no history rewrite, no force-push, no key/credential
  rotation triggered by this scan.
- The pre-existing hygiene is sound for the scanned range: `.gitignore` + the
  `DATABASE_URL` externalization in `39cb79b` (which moved the DB connection
  string out of tracked files into an env var) both held — neither commit
  introduced a secret into tracked content.

## Forward coverage (not this task)

This one-time scan closes the *retroactive* obligation for the already-pushed
refs (req 09 §9.8b). **Forward** secret hygiene is owned by task **1.12**
(pre-commit + pre-push gitleaks hooks + CI gitleaks gate), which prevents any
new secret from entering history going forward. This finding does not need to be
re-run; it is a point-in-time attestation for the initial push.

## Reproducibility

Re-run (informational only — the scanned commits are immutable):

```bash
# Root commit full tree
git worktree add --detach /tmp/gl-root e8a516f
gitleaks dir -c .gitleaks.toml --redact \
  --report-format json --report-path /tmp/gl-e8a516f.json /tmp/gl-root
git worktree remove --force /tmp/gl-root

# 39cb79b incremental diff
gitleaks detect --source . --log-opts="e8a516f..39cb79b" --redact \
  --report-format json --report-path /tmp/gl-39cb79b.json
```

Both reports are expected to remain `[]` unless the immutable history is somehow
altered — at which point the scan would be re-run as part of incident response.
