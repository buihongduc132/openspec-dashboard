/**
 * Task 6.1 (RED) — `WatcherRegistry` core API.
 *
 * Asserts the registry's synchronous contract before chokidar event wiring
 * (tasks 6.2–6.4) and the full debounce suite (task 6.5):
 *  - module-level registry keyed by projectId;
 *  - `startWatch` registers a watcher, `stopWatch` removes + closes it;
 *  - `cap` defaults to 50 and overflow is refused with a warning + no watcher.
 *
 * Chokidar is mocked so this test stays deterministic and FS-independent.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { FAKE_WATCHERS, fakeChokidar } = vi.hoisted(() => {
  const FAKE_WATCHERS: Array<{ close: () => Promise<void>; on: () => unknown }> = [];
  const fakeChokidar = {
    watch: () => {
      const w = {
        on(this: unknown, _event: string, _handler: (...args: unknown[]) => void) {
          return this;
        },
        once(this: unknown, _event: string, _handler: (...args: unknown[]) => void) {
          return this;
        },
        close() {
          return Promise.resolve();
        },
      };
      FAKE_WATCHERS.push(w as never);
      return w;
    },
  };
  return { FAKE_WATCHERS, fakeChokidar };
});

vi.mock("chokidar", () => ({ default: fakeChokidar, watch: fakeChokidar.watch }));

import {
  resetWatcherRegistry,
  startWatch,
  stopWatch,
  DEFAULT_WATCHER_CAP,
  isWatching,
} from "@/lib/projection/watcher";

describe("task 6.1 — WatcherRegistry core API", () => {
  beforeEach(() => {
    resetWatcherRegistry();
    FAKE_WATCHERS.length = 0;
  });

  it("exposes a default cap of 50", () => {
    expect(DEFAULT_WATCHER_CAP).toBe(50);
  });

  it("startWatch registers a watcher and isWatching reflects it", () => {
    const onEvent = vi.fn();
    const started = startWatch("p1", "/tmp/root-a", onEvent);
    expect(started).toBe(true);
    expect(isWatching("p1")).toBe(true);
    expect(FAKE_WATCHERS.length).toBe(1);
  });

  it("stopWatch closes and removes the watcher", async () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root-a", onEvent);
    expect(isWatching("p1")).toBe(true);
    await stopWatch("p1");
    expect(isWatching("p1")).toBe(false);
  });

  it("refuses to exceed the cap, logs a warning, and does not watch", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onEvent = vi.fn();
    // Fill the registry up to the cap.
    for (let i = 0; i < DEFAULT_WATCHER_CAP; i++) {
      startWatch(`p${i}`, `/tmp/root-${i}`, onEvent);
    }
    const overflow = startWatch("overflow", "/tmp/root-overflow", onEvent);
    expect(overflow).toBe(false);
    expect(isWatching("overflow")).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
