/**
 * Task 8.2 — server-startup wiring of the stale-projection sweep.
 *
 * Asserts the content-projection spec's "On startup the system SHALL sweep
 * stale projections" requirement at the wiring layer: the Next.js
 * instrumentation hook (`src/instrumentation.ts`) SHALL invoke
 * `sweepStaleProjects()` once on startup, non-blocking (fire-and-forget with
 * an error catch), so request handling is never blocked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  sweepCalled: false,
  sweepShouldThrow: false,
}));

vi.mock("@/lib/projection/sweep", () => ({
  sweepStaleProjects: () => {
    state.sweepCalled = true;
    if (state.sweepShouldThrow) {
      return Promise.reject(new Error("boom"));
    }
    return Promise.resolve([]);
  },
}));

import { register } from "@/instrumentation";

describe("task 8.2 — instrumentation startup sweep wiring", () => {
  beforeEach(() => {
    state.sweepCalled = false;
    state.sweepShouldThrow = false;
  });

  it("invokes sweepStaleProjects on register()", async () => {
    await register();
    expect(state.sweepCalled).toBe(true);
  });

  it("does not throw when the sweep rejects (fire-and-forget with catch)", async () => {
    state.sweepShouldThrow = true;
    // register() must swallow the rejection so server boot is never broken.
    await expect(register()).resolves.toBeUndefined();
    expect(state.sweepCalled).toBe(true);
  });
});
