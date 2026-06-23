/**
 * Task 6.2 - chokidar configuration assertion.
 *
 * Asserts the content-projection spec's chokidar watcher requirement as it
 * concerns the watcher OPTIONS passed to chokidar:
 *  - cwd is set to the project rootPath;
 *  - the glob targets the openspec subtree (openspec, all depths, all files);
 *  - ignoreInitial true (do not re-fire on the initial scan);
 *  - usePolling false (fs events, not polling);
 *  - awaitWriteFinish stabilityThreshold 500 (debounce).
 *
 * Chokidar is mocked so the options are captured synchronously without any
 * real filesystem access.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ glob: string; opts: Record<string, unknown> }>,
}));

const fakeChokidar = vi.hoisted(() => ({
  watch: (glob: string, opts?: Record<string, unknown>) => {
    captured.calls.push({ glob, opts: opts ?? {} });
    return {
      on() {
        return this;
      },
      once() {
        return this;
      },
      close() {
        return Promise.resolve();
      },
    };
  },
}));

vi.mock("chokidar", () => ({ default: fakeChokidar, watch: fakeChokidar.watch }));

import { resetWatcherRegistry, startWatch } from "@/lib/projection/watcher";

describe("task 6.2 - chokidar configuration", () => {
  beforeEach(() => {
    resetWatcherRegistry();
    captured.calls = [];
  });

  it("passes the openspec glob, cwd, ignoreInitial, usePolling, and awaitWriteFinish options", () => {
    startWatch("p1", "/tmp/root-x", () => {});
    expect(captured.calls).toHaveLength(1);
    const [{ glob, opts }] = captured.calls;

    // Glob is the openspec subtree relative to cwd.
    const expectedGlob = ["openspec", "**", "*"].join("/");
    expect(glob).toBe(expectedGlob);

    expect(opts.cwd).toBe("/tmp/root-x");
    expect(opts.ignoreInitial).toBe(true);
    expect(opts.usePolling).toBe(false);
    // Debounce window of 500ms (matches WATCHER_DEBOUNCE_MS).
    expect(opts.awaitWriteFinish).toEqual({ stabilityThreshold: 500 });
  });
});
