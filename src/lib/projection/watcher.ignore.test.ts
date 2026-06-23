/**
 * Task 6.3 — chokidar `ignored` predicate for the dashboard's own writes.
 *
 * Asserts the content-projection spec's watcher requirement that "The
 * watcher SHALL ignore the dashboard's own writes." Concretely, the chokidar
 * `ignored` option must be a predicate (or array) that rejects paths under
 * `.openspec-dashboard/` and under the dashboard process's own repo root, so
 * the dashboard never re-projects in response to its own emitted files.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const captured = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
}));

const { fakeChokidar } = vi.hoisted(() => {
  const fakeChokidar = {
    watch(_glob: string, options: Record<string, unknown>) {
      captured.options = options;
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
  };
  return { fakeChokidar };
});

vi.mock("chokidar", () => ({ default: fakeChokidar, watch: fakeChokidar.watch }));

import { startWatch, resetWatcherRegistry } from "@/lib/projection/watcher";

describe("task 6.3 — ignored predicate", () => {
  beforeEach(() => {
    resetWatcherRegistry();
    captured.options = null;
  });

  it("passes an `ignored` matcher that rejects .openspec-dashboard paths", () => {
    startWatch("ign-1", "/tmp/project-root", () => {});
    expect(captured.options).not.toBeNull();
    const ignored = captured.options!.ignored;
    // The matcher may be a function or an array; we exercise the function form.
    expect(typeof ignored).toBe("function");
    const match = ignored as (path: string) => boolean;
    expect(match(".openspec-dashboard/cache.json")).toBe(true);
    expect(match("/tmp/project-root/.openspec-dashboard/state.db")).toBe(true);
  });

  it("the `ignored` matcher does NOT reject normal openspec paths", () => {
    startWatch("ign-2", "/tmp/project-root", () => {});
    const match = captured.options!.ignored as (path: string) => boolean;
    expect(match("openspec/specs/auth/spec.md")).toBe(false);
    expect(match("/tmp/project-root/openspec/changes/add-x/proposal.md")).toBe(false);
  });
});
