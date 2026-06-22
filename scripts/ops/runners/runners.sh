#!/usr/bin/env bash
# scripts/ops/runners/runners.sh
#
# repo-runners-manifest canonical wrapper CLI (OpenSpec change
# `repo-runners-resolver`, task 3.1).
#
# Stable surface every Archon workflow [L] node invokes to run a target
# repo's test/typecheck/lint/build/format command WITHOUT making any
# command-detection decision. The manifest (`.archon/runners.yaml`) is the
# sole source of truth; this wrapper resolves + executes.
#
# Governing principle: "Archon is aware of others; others bear no burden."
# See:
#   - .agents/skills/repo-runners-manifest/SKILL.md
#   - .agents/skills/least-l-cognitive/SKILL.md
#
# Exit codes:
#   0    success (incl. documented no-ops: absent optional verb, literal "true")
#   1    wrapper-level error (unknown verb, bad usage, schema error)
#   2    resolver hard-fail: no manifest entry matches the repo
#   42   NOT_IMPLEMENTED stub (runners test single <path>)
#   *    propagated from the underlying resolved command
set -uo pipefail

# --- Locate the manifest -----------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
export RUNNERS_MANIFEST="${RUNNERS_MANIFEST:-$REPO_ROOT/.archon/runners.yaml}"

# All manifest parsing, schema validation, repo resolution, and command
# resolution happens in the embedded Python core below. Bash only locates
# the manifest and delegates.
exec python3 - "$@" <<'PYCORE'
import json, os, re, subprocess, sys

IDENT_RE = re.compile(r'^[a-zA-Z][a-zA-Z0-9_-]*$')

# Canonical verbs and their default aliases (D10 / spec).
CANONICAL = {
    "test_full":   {"aliases": ["test", "tests"],          "required": True},
    "typecheck":   {"aliases": ["tc", "type-check"],        "required": True},
    "lint":        {"aliases": [],                          "required": False},
    "build":       {"aliases": ["compile", "b"],            "required": False},
    "format":      {"aliases": ["fmt"],                     "required": False},
    "format_check":{"aliases": ["fmt-check"],               "required": False},
    "test_single": {"aliases": [],                          "required": False},  # reserved stub
}
CANONICAL_NAMES = set(CANONICAL)
DEFAULT_CANONICAL_ALIASES = {a for info in CANONICAL.values() for a in info["aliases"]}
RESERVED_VERBS = {"resolve", "run", "list", "which", "help", "version"}
RESERVED_TEST_KEYWORDS = {"single"}

class SchemaError(Exception):
    pass

class ResolveError(Exception):
    """No manifest entry matches the repo (exit 2)."""

def _load_raw():
    path = os.environ.get("RUNNERS_MANIFEST", "")
    if not path or not os.path.isfile(path):
        raise SchemaError(
            f"runners manifest not found: RUNNERS_MANIFEST={path!r} "
            f"(expected .archon/runners.yaml in archon-configuration)"
        )
    try:
        import yaml
    except ImportError as e:
        raise SchemaError(f"PyYAML is required to parse the manifest: {e}")
    with open(path) as f:
        try:
            data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise SchemaError(f"manifest is not valid YAML: {e}")
    return path, data

def _command_value(raw):
    """Return (cmd_str, aliases_list, description) from a command field.
    Accepts bare string or {cmd, aliases?, description?}.
    Booleans (from unquoted YAML true/false) are coerced to string."""
    if isinstance(raw, bool):
        raw = "true" if raw else "false"
    if isinstance(raw, str):
        return raw, [], None
    if isinstance(raw, dict):
        cmd = raw.get("cmd")
        if not isinstance(cmd, str):
            raise SchemaError(f"command object missing string `cmd`: {raw!r}")
        aliases = raw.get("aliases") or []
        if not isinstance(aliases, list) or not all(isinstance(a, str) for a in aliases):
            raise SchemaError(f"command `aliases` must be a list of strings: {raw!r}")
        desc = raw.get("description")
        return cmd, aliases, desc
    raise SchemaError(f"command value must be string or {{cmd, ...}} object, got {type(raw).__name__}")

def validate_and_index(data, path):
    """Validate the FULL manifest and return (version, entries_resolved).
    entries_resolved[i] = {
        match_remote, match_aliases, commands: {name: {cmd, aliases, desc, canonical?}},
        alias_index: {alias_or_name: canonical_or_named_key},
    }"""
    if not isinstance(data, dict):
        raise SchemaError("manifest top-level must be a mapping")
    # --- version (D12) ---
    if "version" not in data:
        raise SchemaError("manifest missing top-level `version` field")
    version = data.get("version")
    if version not in (1, 2):
        raise SchemaError(
            f"manifest `version` must be 1 or 2 (got {version!r}); "
            f"this resolver does not support forward-incompatible manifests"
        )
    if version == 1:
        sys.stderr.write(
            "runners: deprecation hint: manifest declares version: 1; "
            "bump to version: 2 (v2 is a strict superset; see design D12).\n"
        )
    entries = data.get("entries")
    if not isinstance(entries, list) or not entries:
        raise SchemaError("manifest missing non-empty `entries` list")

    resolved = []
    # Cross-entry registry of DECLARED aliases (manifest `aliases:` lists).
    # Canonical command names and default canonical aliases are intrinsic to
    # every entry and are NOT globally unique — only manifest-declared aliases
    # are checked for cross-entry collisions (spec D10).
    declared_aliases_global = {}  # alias -> "entry#i/cmdname"

    for i, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise SchemaError(f"entry #{i} is not a mapping")
        match = entry.get("match") or {}
        if not isinstance(match, dict):
            raise SchemaError(f"entry #{i} `match` must be a mapping")
        remote = match.get("remote")
        aliases = match.get("aliases") or []
        if not remote and not aliases:
            raise SchemaError(
                f"entry #{i} `match` must declare `remote` and/or `aliases`"
            )
        if remote is not None and not isinstance(remote, str):
            raise SchemaError(f"entry #{i} `match.remote` must be a string")
        if not isinstance(aliases, list) or not all(isinstance(a, str) for a in aliases):
            raise SchemaError(f"entry #{i} `match.aliases` must be a list of strings")

        cmds_raw = entry.get("commands")
        if not isinstance(cmds_raw, dict) or not cmds_raw:
            raise SchemaError(f"entry #{i} missing `commands` mapping")

        # Required-field check (full-manifest validation).
        for req in ("test_full", "typecheck"):
            if req not in cmds_raw:
                label = remote or (aliases[0] if aliases else f"entry #{i}")
                raise SchemaError(
                    f"entry {label!r} (#{i}) missing required field commands.{req}"
                )

        entry_cmds = {}        # name -> {cmd, aliases, desc}
        entry_token_map = {}   # token (name/alias) -> canonical/named key

        # First pass: canonical + named command keys + identifier regex +
        # reserved-verb collision.
        for key, raw in cmds_raw.items():
            if not IDENT_RE.match(key):
                raise SchemaError(
                    f"entry #{i} command key {key!r} is not a valid identifier "
                    f"(must match {IDENT_RE.pattern})"
                )
            if key in RESERVED_VERBS:
                raise SchemaError(
                    f"entry #{i} command key {key!r} collides with a reserved "
                    f"wrapper verb {sorted(RESERVED_VERBS)}"
                )
            cmd, al, desc = _command_value(raw)
            is_canonical = key in CANONICAL_NAMES
            entry_cmds[key] = {"cmd": cmd, "aliases": list(al), "desc": desc,
                               "canonical": is_canonical}

        # Build the entry's resolvable token map. Canonical names and their
        # default aliases are intrinsic (present in every entry); only
        # manifest-DECLARED aliases undergo the full collision matrix.
        entry_token_map = {}  # token -> owning command key (for resolution)

        def add_token(token, owner_key):
            # within-entry token collision (two commands answer the same token)
            if token in entry_token_map and entry_token_map[token] != owner_key:
                raise SchemaError(
                    f"entry #{i} token {token!r} claimed by both "
                    f"{entry_token_map[token]!r} and {owner_key!r}"
                )
            entry_token_map[token] = owner_key

        # Canonical names + default aliases + named command names populate
        # the resolution map without global-uniqueness claims.
        for key, info in entry_cmds.items():
            add_token(key, key)
            if info["canonical"]:
                for da in CANONICAL[key]["aliases"]:
                    add_token(da, key)

        # Manifest-DECLARED aliases: full collision matrix (spec D10).
        for key, info in entry_cmds.items():
            for al in info["aliases"]:
                if al in RESERVED_VERBS:
                    raise SchemaError(
                        f"entry #{i} alias {al!r} (on command {key!r}) "
                        f"collides with reserved wrapper verb"
                    )
                if al in CANONICAL_NAMES and al != key:
                    raise SchemaError(
                        f"entry #{i} alias {al!r} (on command {key!r}) "
                        f"shadows canonical verb name {al!r}"
                    )
                if al in DEFAULT_CANONICAL_ALIASES:
                    raise SchemaError(
                        f"entry #{i} alias {al!r} (on command {key!r}) "
                        f"collides with a canonical default alias"
                    )
                if al in declared_aliases_global:
                    raise SchemaError(
                        f"alias {al!r} collision across entries: "
                        f"{declared_aliases_global[al]!r} vs entry#{i}/{key!r}"
                    )
                add_token(al, key)
                declared_aliases_global[al] = f"entry#{i}/{key}"

        resolved.append({
            "remote": remote,
            "aliases": list(aliases),
            "commands": entry_cmds,
            "tokens": entry_token_map,
        })
    return version, resolved

def _git_remotes(repo):
    """Return list of remote URLs for repo, origin first if present."""
    urls = []
    if not os.path.isdir(repo):
        return urls
    try:
        names = subprocess.run(
            ["git", "-C", repo, "remote"],
            capture_output=True, text=True,
        ).stdout.split()
    except Exception:
        return urls
    ordered = []
    if "origin" in names:
        ordered.append("origin")
    ordered.extend(n for n in names if n != "origin")
    for name in ordered:
        try:
            r = subprocess.run(
                ["git", "-C", repo, "remote", "get-url", name],
                capture_output=True, text=True,
            )
            if r.returncode == 0:
                u = r.stdout.strip()
                if u:
                    urls.append(u)
        except Exception:
            continue
    return urls

def _basename(repo):
    return os.path.basename(os.path.abspath(repo.rstrip("/")))

def normalize_git_url(url):
    """Normalize git remote URLs for protocol-agnostic comparison.
    Strips protocol prefix (https://, git@, ssh://, git://),
    normalizes separators (: → /), strips trailing .git and slashes."""
    if not url:
        return ""
    url = re.sub(r'^(https?://|git@|ssh://|git://)', '', url.strip())
    url = url.replace(':', '/')
    if url.endswith('.git'):
        url = url[:-4]
    return url.strip('/')

def resolve_entry(repo, entries):
    remotes = _git_remotes(repo)
    # 1. remote URL match (normalized — SSH vs HTTPS, trailing .git)
    for url in remotes:
        norm_url = normalize_git_url(url)
        for idx, e in enumerate(entries):
            if e["remote"] and normalize_git_url(e["remote"]) == norm_url:
                return idx, e, url, None
    # 2. basename alias match
    base = _basename(repo)
    for idx, e in enumerate(entries):
        if base in e["aliases"]:
            return idx, e, None, base
    # 3. hard-fail
    raise ResolveError((remotes, base))

def cmd_field(entry, key):
    """Return the cmd string for a canonical/named key, or None if absent."""
    info = entry["commands"].get(key)
    return info["cmd"] if info else None

def emit_resolve_shell(entry_idx, entry, remote, alias):
    out = {
        "TEST_FULL_CMD": cmd_field(entry, "test_full") or "",
        "TYPECHECK_CMD": cmd_field(entry, "typecheck") or "",
        "LINT_CMD":      cmd_field(entry, "lint") or "",
    }
    for k, v in out.items():
        print(f'{k}={_shellquote(v)}')
    print(f'RUNNERS_ENTRY_INDEX={entry_idx}')
    r = remote if remote is not None else ""
    print(f'RUNNERS_MATCHED_REMOTE={_shellquote(r)}')
    print(f'RUNNERS_MATCHED_ALIAS={_shellquote(alias or "")}')

def emit_resolve_json(entry_idx, entry, remote, alias):
    obj = {
        "TEST_FULL_CMD": cmd_field(entry, "test_full") or "",
        "TYPECHECK_CMD": cmd_field(entry, "typecheck") or "",
        "LINT_CMD":      cmd_field(entry, "lint") or "",
        "remote": remote if remote is not None else None,
        "alias": alias,
        "entry_index": entry_idx,
        "test_timeout_sec": entry.get("test_timeout_sec", 300),
    }
    print(json.dumps(obj, indent=2))

def _shellquote(s):
    if s == "":
        return '""'
    if re.fullmatch(r'[A-Za-z0-9_@%+=:,./-]+', s):
        return s
    return "'" + s.replace("'", "'\"'\"'") + "'"

# --- verb handlers -----------------------------------------------------------

def _load_and_resolve(repo):
    path, data = _load_raw()
    version, entries = validate_and_index(data, path)
    idx, entry, remote, alias = resolve_entry(repo, entries)
    return path, version, entries, idx, entry, remote, alias

def _print_resolve_error(err, path):
    remotes, base = err.args[0]
    remote_str = ", ".join(remotes) if remotes else "(no git remote configured)"
    msg = (
        f"runners: no manifest entry matches this repo.\n"
        f"  unmatched remote(s): {remote_str}\n"
        f"  unmatched basename : {base}\n"
        f"  manifest path      : {path}\n"
        f"  required fields    : commands.test_full, commands.typecheck\n"
        f"  To register, add an entry under `entries:` in {path} with a "
        f"`match.remote` or `match.aliases:` that identifies this repo.\n"
    )
    sys.stderr.write(msg)

def verb_resolve(argv):
    repo = os.getcwd()
    as_json = False
    for a in argv:
        if a == "--json":
            as_json = True
        elif not a.startswith("-"):
            repo = a
    try:
        path, version, entries, idx, entry, remote, alias = _load_and_resolve(repo)
    except ResolveError as e:
        _print_resolve_error(e, os.environ.get("RUNNERS_MANIFEST", ""))
        return 2
    except SchemaError as e:
        sys.stderr.write(f"runners: schema error: {e}\n")
        return 1
    if as_json:
        emit_resolve_json(idx, entry, remote, alias)
    else:
        emit_resolve_shell(idx, entry, remote, alias)
    return 0

def _run_command_for(verb_token, repo):
    """Resolve verb_token to a cmd string for the matched entry and return
    (cmd_str, canonical_key) where cmd_str may be None for absent optional
    fields. Raises ResolveError/SchemaError as appropriate."""
    path, version, entries, idx, entry, remote, alias = _load_and_resolve(repo)
    tokens = entry["tokens"]
    if verb_token not in tokens:
        # Not a known command/alias for this entry.
        return None, None, entry, tokens
    key = tokens[verb_token]
    return entry["commands"][key]["cmd"], key, entry, tokens

def _exec_cmd(cmd_str, repo, timeout_sec=None):
    """cd into repo and run cmd_str; propagate exit code. Special-case 'true'.

    If `timeout_sec` (int seconds) is provided and > 0, the command is wrapped
    in `timeout <sec>` so an overrunning suite (e.g. e2e) cannot wedge the
    node forever. Exit code 124 from `timeout(1)` is propagated as-is so the
    caller distinguishes 'command timed out' from a real failure.
    """
    if cmd_str == "true":
        return 0
    if cmd_str is None or cmd_str == "":
        return 0
    if timeout_sec and int(timeout_sec) > 0:
        cmd_str = f"timeout {int(timeout_sec)} {cmd_str}"
    rc = subprocess.call(cmd_str, shell=True, cwd=repo)
    return rc

OPTIONAL_CANONICAL = {"lint", "build", "format", "format_check"}
# Tokens (canonical names + default aliases) whose absence in an entry is a
# documented NO-OP (spec task 3.2 / D8): `runners lint|build|format|format_check`
# SHALL exit 0 when the entry omits the field. Includes the default aliases
# (`compile`, `b`, `fmt`, `fmt-check`) so `runners fmt` on an entry with no
# `format` field is also a no-op.
OPTIONAL_CANONICAL_TOKENS = set(OPTIONAL_CANONICAL)
for _v in OPTIONAL_CANONICAL:
    OPTIONAL_CANONICAL_TOKENS.update(CANONICAL[_v]["aliases"])

def verb_run_command(verb_token, argv, *, allow_absent_noop):
    repo = os.getcwd()
    for a in argv:
        if not a.startswith("-"):
            repo = a
    try:
        cmd_str, key, entry, tokens = _run_command_for(verb_token, repo)
    except ResolveError as e:
        _print_resolve_error(e, os.environ.get("RUNNERS_MANIFEST", ""))
        return 2
    except SchemaError as e:
        sys.stderr.write(f"runners: schema error: {e}\n")
        return 1
    if key is None:
        # Token not recognized for this entry.
        if allow_absent_noop and verb_token in OPTIONAL_CANONICAL_TOKENS:
            # An OPTIONAL canonical verb (or its default alias) that the entry
            # simply omits — spec-defined NO-OP, exit 0.
            return 0
        sys.stderr.write(
            f"runners: {verb_token!r} is not a known command or alias "
            f"for this repo. Use `runners list` to see declared commands.\n"
        )
        return 1
    if cmd_str is None or cmd_str == "":
        # Shouldn't happen for resolved keys (key resolved but no cmd) —
        # defensive: treat as no-op for optional canonical, else error.
        if key in OPTIONAL_CANONICAL:
            return 0
        sys.stderr.write(f"runners: internal error: no cmd for {key!r}\n")
        return 1
    # Per-entry optional `test_timeout_sec` (CA2). Only `test_full` honours
    # it — typecheck/lint/build are usually fast enough to skip. We read the
    # entry-level field and pass through to _exec_cmd.
    timeout_sec = None
    if key == "test_full":
        raw_ts = entry.get("test_timeout_sec")
        if raw_ts is not None:
            try:
                timeout_sec = int(raw_ts)
            except (TypeError, ValueError):
                sys.stderr.write(
                    f"runners: entry `test_timeout_sec` must be int seconds "
                    f"(got {raw_ts!r}); ignoring\n"
                )
                timeout_sec = None
    return _exec_cmd(cmd_str, repo, timeout_sec=timeout_sec)

def verb_test(argv):
    # reserved subcommand keyword `single`?
    if argv and argv[0] in RESERVED_TEST_KEYWORDS:
        sys.stderr.write(
            "runners: `test single <path>` is NOT_IMPLEMENTED "
            "(reserved for separate-scope RED/GREEN single-test work).\n"
        )
        return 42
    return verb_run_command("test", argv, allow_absent_noop=False)

def verb_list(argv):
    path, data = _load_raw()
    version, entries = validate_and_index(data, path)
    repo = None
    for a in argv:
        if not a.startswith("-"):
            repo = a
    target_idx = None
    if repo is not None:
        try:
            _, _, _, target_idx, _, _, _ = _load_and_resolve(repo)
        except Exception:
            target_idx = None
    print(f"# runners manifest: {path} (version {version})")
    for i, e in enumerate(entries):
        marker = " *" if i == target_idx else ""
        ids = []
        if e["remote"]:
            ids.append(f"remote={e['remote']}")
        if e["aliases"]:
            ids.append("aliases=" + ",".join(e["aliases"]))
        print(f"[{i}]{marker} {' '.join(ids)}")
        for name, info in e["commands"].items():
            tag = "canonical" if info["canonical"] else "named"
            al = (",".join(info["aliases"]) if info["aliases"] else "")
            alsfx = f" aliases=[{al}]" if al else ""
            # include default aliases for canonical verbs
            if info["canonical"]:
                defs = CANONICAL[name]["aliases"]
                if defs:
                    alsfx += f" defaults=[{','.join(defs)}]"
            print(f"    {name} ({tag}): {info['cmd']!r}{alsfx}")
    return 0

def verb_which(argv):
    repo = os.getcwd()
    for a in argv:
        if not a.startswith("-"):
            repo = a
    try:
        path, version, entries, idx, entry, remote, alias = _load_and_resolve(repo)
    except ResolveError as e:
        _print_resolve_error(e, os.environ.get("RUNNERS_MANIFEST", ""))
        return 2
    except SchemaError as e:
        sys.stderr.write(f"runners: schema error: {e}\n")
        return 1
    matchvia = f"remote={remote}" if remote else f"alias={alias}"
    print(f"# matched entry [{idx}] via {matchvia}")
    if entry["remote"]:
        print(f"remote: {entry['remote']}")
    print(f"aliases: {','.join(entry['aliases'])}")
    print("commands:")
    for name, info in entry["commands"].items():
        tag = "canonical" if info["canonical"] else "named"
        print(f"  {name} ({tag}): {info['cmd']!r}")
    return 0

def verb_run(argv):
    if not argv:
        sys.stderr.write("runners: `run <name> [<repo>]` requires a <name>\n")
        return 1
    name = argv[0]
    rest = argv[1:]
    # `run <name>` resolves against names + aliases identically to bare form,
    # INCLUDING the absent-optional-verb no-op rule (D11 parity with bare verbs).
    return verb_run_command(
        name, rest, allow_absent_noop=(name in OPTIONAL_CANONICAL_TOKENS))

HELP_TEXT = """\
runners — repo-runners canonical wrapper CLI

Usage:
  runners resolve [<repo>] [--json]     emit resolved commands (shell or JSON)
  runners test [<repo>]                 run commands.test_full (alias: tests)
  runners typecheck [<repo>]            run commands.typecheck (aliases: tc, type-check)
  runners lint [<repo>]                 run commands.lint (no-op if absent)
  runners build [<repo>]                run commands.build (no-op if absent)
  runners format [<repo>]               run commands.format (no-op if absent)
  runners format_check [<repo>]         run commands.format_check (no-op if absent)
  runners test single <path> [<repo>]   RESERVED — exits 42 NOT_IMPLEMENTED
  runners list [<repo>]                 list all entries (mark matched)
  runners which [<repo>]                show the matched entry without running
  runners run <name> [<repo>]           escape hatch: run any command/alias
  runners help                          this help
  runners version                       print version

Canonical default aliases (always resolvable, no manifest opt-in):
  test, tests        -> test_full
  tc, type-check     -> typecheck
  compile, b         -> build
  fmt                -> format
  fmt-check          -> format_check

Reserved top-level verbs (cannot be used as command names/aliases):
  resolve, run, list, which, help, version

Reserved `test` subcommand keyword (cannot be a bare <repo> basename):
  single
  (Address a repo literally named `single` via an explicit path, e.g. `./single`.)

`run <name>` is the unambiguous escape hatch for any command or alias,
useful when a name borders on the reserved namespace.

<repo> defaults to $PWD. Resolution: git remote get-url (origin, then others)
-> remote URL match; else basename -> alias match; else exit 2 with a
registration hint.
"""

def verb_help(argv):
    sys.stdout.write(HELP_TEXT)
    return 0

def verb_version(argv):
    print("runners 1.0.0 (repo-runners-manifest schema v2)")
    return 0

def main(argv):
    if not argv:
        verb_help([])
        return 1
    verb = argv[0]
    rest = argv[1:]
    # Reserved top-level verbs.
    if verb == "help" or verb == "--help" or verb == "-h":
        return verb_help(rest)
    if verb == "version" or verb == "--version":
        return verb_version(rest)
    if verb == "resolve":
        return verb_resolve(rest)
    if verb == "list":
        return verb_list(rest)
    if verb == "which":
        return verb_which(rest)
    if verb == "run":
        return verb_run(rest)
    if verb == "test":
        return verb_test(rest)
    # Canonical verbs (non-test) and their default aliases + named commands.
    canonical_alias_to_key = {}
    for k, info in CANONICAL.items():
        canonical_alias_to_key[k] = k
        for a in info["aliases"]:
            canonical_alias_to_key[a] = k
    if verb in canonical_alias_to_key and verb != "test":
        # typecheck/lint/build/format/format_check and aliases
        key = canonical_alias_to_key[verb]
        return verb_run_command(verb, rest, allow_absent_noop=(key in OPTIONAL_CANONICAL))
    # Otherwise: treat as a named command / declared alias for the repo.
    # (Resolution happens against the matched entry inside verb_run_command.)
    return verb_run_command(verb, rest, allow_absent_noop=False)

if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except SchemaError as e:
        sys.stderr.write(f"runners: schema error: {e}\n")
        sys.exit(1)
PYCORE
