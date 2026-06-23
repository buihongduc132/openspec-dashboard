/**
 * Task 6.5 — full `watcher.test.ts` suite.
 *
 * Asserts the content-projection spec's "A chokidar watcher SHALL keep
 * projection fresh per local project" requirement end-to-end:
 *  - file events under `<rootPath>/openspec/` fire the registered `onEvent`
 *    callback after the 500ms debounce window (coalescing a burst into one);
 *  - the cap is enforced — exceeding it logs a warning and does NOT start a
 *    watcher (the caller falls back to manual re-project);
 *  - stopWatch cancels a pending debounced event so no stale projection fires.
 *
 * chokidar is mocked so we control event emission precisely and can drive the
 * debounce with fake timers.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * Minimal FSWatcher double that records the 'all' handler so the test can
 * synthesize file events, and tracks close() calls.
 */
interface FakeWatcher {
  on(event: string, handler: (...args: unknown[]) => void): this;
  once(event: string, handler: (...args: unknown[]) => void): this;
  close(): Promise<void>;
  /** Test-only: stored handler from `watcher.on('all', ...)` (and 'ready'). */
  handlers: Record<string, Array<(...args: unknown[]) => void>>;
  closed: boolean;
}

const FAKE_WATCHERS: FakeWatcher[] = [];
let watchCallCount = 0;

const { fakeChokidar } = vi.hoisted(() => {
  const fakeChokidar = {
    watch(_glob: string, _opts: unknown): FakeWatcher {
      watchCallCount += 1;
      const w: FakeWatcher = {
        handlers: {},
        closed: false,
        on(event, handler) {
          (this.handlers[event] ??= []).push(handler);
          return this;
        },
        once(event, handler) {
          (this.handlers[event] ??= []).push(handler);
          return this;
        },
        close() {
          this.closed = true;
          return Promise.resolve();
        },
      };
      FAKE_WATCHERS.push(w);
      return w;
    },
  };
  return { fakeChokidar };
});

vi.mock("chokidar", () => ({ default: fakeChokidar, watch: fakeChokidar.watch }));

import {
  startWatch,
  stopWatch,
  resetWatcherRegistry,
  watcherCount,
} from "@/lib/projection/watcher";

describe("task 6.5 — watcher debounce + enqueue-on-event + cap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetWatcherRegistry();
    FAKE_WATCHERS.length = 0;
    watchCallCount = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onEvent once for a burst of file events after the 500ms debounce", () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root", onEvent);

    const w = FAKE_WATCHERS[0];
    // Emit several 'all' events in quick succession (< 500ms apart).
    w.handlers.all[0]("add", "openspec/specs/auth/spec.md");
    w.handlers.all[0]("change", "openspec/specs/auth/spec.md");
    w.handlers.all[0]("add", "openspec/changes/add-x/proposal.md");

    // Before the debounce window elapses, nothing has fired.
    expect(onEvent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(onEvent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    // The burst coalesced into exactly one projection trigger.
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith("p1");
  });

  it("does not fire onEvent for events outside the debounce window separately", () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root", onEvent);
    const w = FAKE_WATCHERS[0];

    w.handlers.all[0]("add", "a.md");
    vi.advanceTimersByTime(500);
    expect(onEvent).toHaveBeenCalledTimes(1);

    // A later event starts a fresh debounce.
    w.handlers.all[0]("add", "b.md");
    vi.advanceTimersByTime(500);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("logs a warning and refuses to watch when the cap is exceeded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onEvent = vi.fn();
    // Fill to the cap (default 50).
    for (let i = 0; i < 50; i++) {
      startWatch(`cap-${i}`, `/tmp/r-${i}`, onEvent);
    }
    expect(watcherCount()).toBe(50);

    const overflow = startWatch("overflow", "/tmp/overflow", onEvent);
    expect(overflow).toBe(false);
    expect(watcherCount()).toBe(50);
    // No watcher was created for the overflow project.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stopWatch cancels a pending debounced event", async () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root", onEvent);
    const w = FAKE_WATCHERS[0];

    w.handlers.all[0]("add", "a.md");
    await stopWatch("p1");
    // Advancing past the debounce window must NOT fire onEvent — stop cleared it.
    vi.advanceTimersByTime(1000);
    expect(onEvent).not.toHaveBeenCalled();
    expect(w.closed).toBe(true);
  });
});
