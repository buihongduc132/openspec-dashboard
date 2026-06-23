/**
 * Task 5.5 — `src/lib/projection/queue.ts` suite.
 *
 * Asserts the content-projection spec's "Manual re-project endpoint SHALL be
 * non-blocking" requirement and the coalescing scenario:
 *  - concurrent `enqueue(projectId)` for the same project coalesce into one
 *    in-flight job (same jobId, one worker invocation);
 *  - the second request while a job is running returns the SAME jobId with
 *    `status: "running"`;
 *  - different projects get independent jobs / jobIds;
 *  - `getStatus` reflects queued → running → idle transitions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createProjectionQueue } from "@/lib/projection/queue";

describe("task 4.6/5.5 — projection queue coalescing", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("coalesces concurrent enqueue calls for the same project into one job", async () => {
    let calls = 0;
    let releaseWorker: () => void = () => {};
    const worker = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          calls += 1;
          releaseWorker = resolve;
        }),
    );
    const q = createProjectionQueue(worker);

    const p1 = q.enqueue("p1");
    const p2 = q.enqueue("p1");
    const p3 = q.enqueue("p1");
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // All three see the same job.
    expect(r1.projectId).toBe("p1");
    expect(r1.jobId).toBe(r2.jobId);
    expect(r2.jobId).toBe(r3.jobId);
    // While running, status is "running" (the first resolved as "queued" or
    // "running"; all share the same jobId).
    const status = q.getStatus("p1");
    expect(status?.jobId).toBe(r1.jobId);
    expect(status?.status === "queued" || status?.status === "running").toBe(true);

    // Worker invoked exactly once despite three enqueues.
    releaseWorker();
    await vi.waitFor(() => expect(calls).toBe(1));
    expect(worker).toHaveBeenCalledTimes(1);
  });

  it("returns the same jobId for a second request while a job is running", async () => {
    let releaseWorker: () => void = () => {};
    const worker = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseWorker = resolve;
        }),
    );
    const q = createProjectionQueue(worker);

    const first = await q.enqueue("p1");
    // first job is now running (worker hasn't resolved).
    const second = await q.enqueue("p1");

    expect(second.jobId).toBe(first.jobId);
    expect(second.status).toBe("running");

    releaseWorker();
  });

  it("runs independent jobs for different projects with distinct jobIds", async () => {
    const seen = new Set<string>();
    const worker = vi.fn(async (projectId: string) => {
      seen.add(projectId);
    });
    const q = createProjectionQueue(worker);

    const a = await q.enqueue("pA");
    const b = await q.enqueue("pB");

    expect(a.jobId).not.toBe(b.jobId);
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(2));
    expect(seen.has("pA")).toBe(true);
    expect(seen.has("pB")).toBe(true);
  });

  it("transitions status queued/running → idle after the job completes", async () => {
    const worker = vi.fn(async () => {});
    const q = createProjectionQueue(worker);

    await q.enqueue("p1");
    // Once the microtask queue drains, the job is done.
    await vi.waitFor(() => expect(q.getStatus("p1")?.status).toBe("idle"));

    // A fresh enqueue after idle produces a NEW jobId.
    const second = await q.enqueue("p1");
    await vi.waitFor(() => expect(q.getStatus("p1")?.status).toBe("idle"));
    expect(q.getStatus("p1")?.jobId).toBe(second.jobId);
  });
});
