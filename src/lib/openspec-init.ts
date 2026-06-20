/**
 * OpenSpec CLI runner (task 3.4).
 *
 * When a candidate directory is not already an OpenSpec project, the user can
 * accept the dashboard's offer to run `openspec init` in that directory. This
 * module provides a *typed* child-process wrapper around the OpenSpec CLI that
 * yields stdout/stderr/exit events as an async stream, so the API route can
 * stream them straight back to the UI (design decision D-MPCD-4).
 *
 * The CLI command and its `init` arguments are configurable via environment
 * so tests / operators can point at a wrapper binary, but the default is the
 * plain `openspec init` invocation. The spawn implementation is also
 * injectable so the event-yielding logic can be unit-tested without spawning a
 * real process.
 */
import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";

/** Env var override for the OpenSpec CLI binary (default `openspec`). */
export const OPENSPEC_CLI_ENV = "OPENSPEC_CLI";

/**
 * Env var override for *extra* args appended after `init` (whitespace-split).
 * Lets operators pass e.g. `--schema spec-driven` without code changes.
 */
export const OPENSPEC_INIT_ARGS_ENV = "OPENSPEC_INIT_ARGS";

/** A single streamed event from an OpenSpec CLI run. */
export type InitStreamEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "exit"; code: number };

/**
 * A read-only view of process environment variables keyed by name.
 *
 * We deliberately use this structural record type instead of
 * `NodeJS.ProcessEnv`: Next.js augments `NodeJS.ProcessEnv` to make
 * `NODE_ENV` *required*, which makes it impossible to pass partial env
 * objects (e.g. in tests). Callers still pass `process.env` in production;
 * this type just widens what we accept to a plain string-keyed record.
 */
export type EnvRecord = Record<string, string | undefined>;

/** Resolved command + args for the `openspec init` invocation. */
export function getInitCommand(env: EnvRecord = process.env): {
  cmd: string;
  args: string[];
} {
  const cmd = env[OPENSPEC_CLI_ENV]?.trim() || "openspec";
  const extra = (env[OPENSPEC_INIT_ARGS_ENV] ?? "")
    .split(/\s+/)
    .filter((s) => s.length > 0);
  return { cmd, args: ["init", ...extra] };
}

/** Injectable spawn signature (defaults to `node:child_process.spawn`). */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; stdio: ["ignore", "pipe", "pipe"] },
) => ChildProcess;

/** A running OpenSpec CLI init handle: the child plus its event stream. */
export interface InitRunHandle {
  child: ChildProcess;
  events: AsyncIterable<InitStreamEvent>;
}

/**
 * Spawn the OpenSpec CLI's `init` command in `cwd` and return the running
 * child plus an async iterable of {@link InitStreamEvent}s (stdout / stderr
 * chunks, then a single terminal `exit` event carrying the exit code).
 *
 * `spawnImpl` is injectable for testing; production callers use the real
 * `node:child_process.spawn`. The helper never throws on spawn failure —
 * instead it surfaces the failure as a non-zero `exit` event so the streaming
 * response stays uniform.
 */
export function spawnOpenSpecInit(
  cwd: string,
  env: EnvRecord = process.env,
  spawnImpl: SpawnFn = defaultSpawn,
): InitRunHandle {
  const { cmd, args } = getInitCommand(env);
  const child = spawnImpl(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  async function* events(): AsyncIterable<InitStreamEvent> {
    if (child.stdout) {
      for await (const chunk of child.stdout) {
        yield { type: "stdout", data: chunk.toString() };
      }
    }
    if (child.stderr) {
      for await (const chunk of child.stderr) {
        yield { type: "stderr", data: chunk.toString() };
      }
    }
    const code: number = await new Promise((resolve) => {
      child.once("close", (c) => resolve(c ?? 1));
      child.once("error", () => resolve(1));
    });
    yield { type: "exit", code };
  }

  return { child, events: events() };
}
