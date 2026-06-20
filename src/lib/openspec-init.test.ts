/**
 * Task 3.4 — typed child-process wrapper unit tests.
 *
 * `src/lib/openspec-init.ts` wraps the OpenSpec CLI's `init` command in a
 * typed, injectable spawn. Here we drive it with a fake spawn (no real
 * process) and assert the command resolution + the event stream. The endpoint
 * that consumes this helper is tested in
 * `src/app/api/enrollment/init/route.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { spawnOpenSpecInit, getInitCommand, type SpawnFn } from "@/lib/openspec-init";

/**
 * Build a fake ChildProcess. stdout/stderr are `Readable.from` streams (which
 * the `for await` consumer drains in microtasks), and the terminal
 * `close`/`error` event is emitted via `setImmediate` (a later event-loop phase),
 * so the consumer always attaches its listener before the event fires.
 */
function fakeChild(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
}): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  (child as ChildProcess & { stdout: Readable }).stdout = Readable.from(
    opts.stdout != null ? [opts.stdout] : [],
  );
  (child as ChildProcess & { stderr: Readable }).stderr = Readable.from(
    opts.stderr != null ? [opts.stderr] : [],
  );
  setImmediate(() => {
    if (opts.error) child.emit("error", opts.error);
    else child.emit("close", opts.exitCode ?? 0);
  });
  return child;
}

/** A fake spawn that records its inputs and returns the given child. */
function makeSpawn(
  child: ChildProcess,
  captured: { cmd?: string; args?: string[]; cwd?: string },
): SpawnFn {
  return (cmd, args, opts) => {
    captured.cmd = cmd;
    captured.args = args;
    captured.cwd = opts.cwd;
    return child;
  };
}

describe("src/lib/openspec-init — typed child-process wrapper", () => {
  describe("getInitCommand", () => {
    it("resolves `openspec init` by default", () => {
      expect(getInitCommand({})).toEqual({ cmd: "openspec", args: ["init"] });
    });

    it("honours OPENSPEC_CLI and OPENSPEC_INIT_ARGS env overrides", () => {
      const env = {
        OPENSPEC_CLI: "/opt/openspec-bin",
        OPENSPEC_INIT_ARGS: "--schema spec-driven --yes",
      };
      expect(getInitCommand(env)).toEqual({
        cmd: "/opt/openspec-bin",
        args: ["init", "--schema", "spec-driven", "--yes"],
      });
    });

    it("ignores blank extra-args segments", () => {
      expect(getInitCommand({ OPENSPEC_INIT_ARGS: "   " })).toEqual({
        cmd: "openspec",
        args: ["init"],
      });
    });
  });

  describe("spawnOpenSpecInit", () => {
    it("spawns the CLI with cwd set to the chosen directory and streams events", async () => {
      const child = fakeChild({
        stdout: "creating openspec/config.yaml\n",
        stderr: "warn: files present\n",
        exitCode: 0,
      });
      const captured: { cmd?: string; args?: string[]; cwd?: string } = {};
      const { events } = spawnOpenSpecInit(
        "/tmp/whatever",
        {},
        makeSpawn(child, captured),
      );

      const collected = [];
      for await (const evt of events) collected.push(evt);

      expect(captured.cmd).toBe("openspec");
      expect(captured.args).toContain("init");
      expect(captured.cwd).toBe("/tmp/whatever");
      expect(collected).toEqual(
        expect.arrayContaining([
          { type: "stdout", data: "creating openspec/config.yaml\n" },
          { type: "stderr", data: "warn: files present\n" },
          { type: "exit", code: 0 },
        ]),
      );
    });

    it("surfaces a spawn error as a non-zero exit event (no throw)", async () => {
      const child = fakeChild({ error: new Error("ENOENT") });
      const { events } = spawnOpenSpecInit(
        "/tmp/x",
        {},
        makeSpawn(child, {}),
      );

      const out: { type: string; code?: number }[] = [];
      for await (const evt of events) out.push(evt as { type: string; code?: number });
      expect(out[out.length - 1]).toEqual({ type: "exit", code: 1 });
    });

    it("passes OPENSPEC_CLI override through to the spawn call", async () => {
      const child = fakeChild({ exitCode: 0 });
      const captured: { cmd?: string; args?: string[] } = {};
      const { events } = spawnOpenSpecInit(
        "/tmp/y",
        { OPENSPEC_CLI: "/opt/openspec-bin" },
        makeSpawn(child, captured),
      );
      for await (const evt of events) {
        void evt;
      }
      expect(captured.cmd).toBe("/opt/openspec-bin");
    });
  });
});
