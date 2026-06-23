/**
 * Task 4.3 (RED) — chokidar watcher: self-write suppression + bulk debounce +
 * live reconciliation.
 *
 * Drives `src/lib/projection/watcher.ts` (task 4.4 GREEN) against the
 * filesystem-projection spec requirement "Filesystem watcher rebuilds the
 * projection within 2s (NFR-3)":
 *
 *  - Scenario "Out-of-band edit is reconciled": an external edit fires
 *    `onEvent` within 2s (the 500ms debounce window is well under budget).
 *  - Scenario "Bulk git operation does not crash the watcher": 200 file
 *    events coalesce into exactly one `onEvent`; the watcher does not throw.
 *  - Scenario "Watcher self-write suppression": when the server marks a path
 *    as just-written (in-process marker), the change event our own atomic
 *    write produced is suppressed — no redundant reconciliation.
 *
 * Design D0-2: chokidar + debounce(500ms) + in-process self-write marker Set.
 * Chokidar is mocked so the debounce can be driven deterministically with
 * fake timers.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import path from "node:path";

const { FAKE_WATCHERS, fakeChokidar } = vi.hoisted(() => {
  interface FakeWatcher {
    on(event: string, handler: (...args: unknown[]) => void): this;
    once(event: string, handler: (...args: unknown[]) => void): this;
    close(): Promise<void>;
    handlers: Record<string, Array<(...args: unknown[]) => void>>;
    closed: boolean;
  }
  const FAKE_WATCHERS: FakeWatcher[] = [];
  const fakeChokidar = {
    watch(_glob: string, _opts: unknown): FakeWatcher {
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
  return { FAKE_WATCHERS, fakeChokidar };
});

vi.mock("chokidar", () => ({ default: fakeChokidar, watch: fakeChokidar.watch }));

import {
  startWatch,
  resetWatcherRegistry,
  markSelfWrite,
  isSelfWriteMarked,
  WATCHER_DEBOUNCE_MS,
} from "@/lib/projection/watcher";

describe("task 4.3 — chokidar self-write suppression + bulk debounce + <2s reconcile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetWatcherRegistry();
    FAKE_WATCHERS.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconciles an out-of-band edit within 2s (NFR-3)", () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root", onEvent);

    FAKE_WATCHERS[0].handlers.all[0]("change", "openspec/tasks.md");

    // The debounce window (500ms) is well under the 2s NFR-3 budget.
    vi.advanceTimersByTime(WATCHER_DEBOUNCE_MS);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith("p1");
    expect(WATCHER_DEBOUNCE_MS).toBeLessThan(2000);
  });

  it("debounces a bulk git checkout (200 files) into a single onEvent", () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root", onEvent);
    const w = FAKE_WATCHERS[0];

    // A `git checkout` touching 200 files fires 200 chokidar events.
    for (let i = 0; i < 200; i++) {
      w.handlers.all[0]("add", `openspec/specs/s${i}/spec.md`);
    }

    // Nothing fires while the burst is in-flight.
    expect(onEvent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WATCHER_DEBOUNCE_MS);
    // The whole burst coalesced into exactly one reconciliation.
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith("p1");
  });

  it("suppresses a self-write event via the in-process marker (no redundant reconcile)", () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root", onEvent);
    const selfWrittenFile = path.join("/tmp/root", "openspec", "tasks.md");

    // The atomic-write layer announces its own write BEFORE chokidar reports it.
    markSelfWrite("p1", selfWrittenFile);
    expect(isSelfWriteMarked("p1", selfWrittenFile)).toBe(true);

    // chokidar then emits the change event our own rename produced.
    FAKE_WATCHERS[0].handlers.all[0]("change", "openspec/tasks.md");

    vi.advanceTimersByTime(2000);
    // The self-write was suppressed — no redundant reconciliation.
    expect(onEvent).not.toHaveBeenCalled();
    // The marker is consumed after the suppressed event.
    expect(isSelfWriteMarked("p1", selfWrittenFile)).toBe(false);
  });

  it("does NOT suppress a genuine out-of-band edit on a different file", () => {
    const onEvent = vi.fn();
    startWatch("p1", "/tmp/root", onEvent);

    FAKE_WATCHERS[0].handlers.all[0]("change", "openspec/changes/x/proposal.md");

    vi.advanceTimersByTime(WATCHER_DEBOUNCE_MS);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
