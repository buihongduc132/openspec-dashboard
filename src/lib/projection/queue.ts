/**
 * Task 4.6 — projection job queue with per-project coalescing.
 *
 * An in-memory FIFO that serializes projection work per project (design D4):
 * at most one projection runs at a time for a given `projectId`, and any
 * `enqueue(projectId)` calls made while a job is already in-flight for that
 * project coalesce onto the SAME job — they all resolve with the same
 * `{ jobId, status, projectId }` and the registered worker is invoked exactly
 * once. Different projects run independent jobs with distinct jobIds.
 *
 * Rationale (content-projection spec, "Manual re-project endpoint SHALL be
 * non-blocking"): the HTTP handler enqueues and returns 202 immediately with
 * the job id; concurrent duplicate requests do NOT pile up work. The queue
 * holds a module-level registry so the status endpoint can read
 * `{ jobId, status, startedAt }` for the current job without re-running it.
 *
 * This module owns the queue lifecycle only — it does NOT know how to project.
 * The actual projection (`projectProject`) is injected as a `ProjectWorker`
 * when the queue is constructed, keeping this module trivially unit-testable.
 */
import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "idle" | "failed";

export interface EnqueueResult {
  jobId: string;
  status: "queued" | "running";
  projectId: string;
}

export interface JobStatusSnapshot {
  jobId: string;
  status: JobStatus;
  startedAt: Date | null;
}

/** A function that performs the projection for one project. */
export type ProjectWorker = (projectId: string) => Promise<unknown>;

interface InFlightJob {
  jobId: string;
  projectId: string;
  startedAt: Date;
  status: "queued" | "running";
  /** Resolves every coalesced enqueue caller with the job descriptor. */
  completion: Promise<EnqueueResult>;
}

export interface ProjectionQueue {
  /** Enqueue (or coalesce onto) a projection job for `projectId`. */
  enqueue(projectId: string): Promise<EnqueueResult>;
  /** Snapshot of the current job for a project, or null when idle. */
  getStatus(projectId: string): JobStatusSnapshot | null;
  /** Drop all known state (test helper / shutdown). */
  clear(): void;
}

/**
 * Construct a projection queue bound to a `worker`. The worker is invoked at
 * most once per coalesced batch and serially per project.
 */
export function createProjectionQueue(worker: ProjectWorker): ProjectionQueue {
  // One in-flight job per project — this is the coalescing seam.
  const inFlight = new Map<string, InFlightJob>();
  // Last-completed job id per project, so `getStatus` can report idle/failed
  // with a stable jobId after completion.
  const lastJob = new Map<
    string,
    { jobId: string; startedAt: Date; status: "idle" | "failed" }
  >();

  function getStatus(projectId: string): JobStatusSnapshot | null {
    const live = inFlight.get(projectId);
    if (live) {
      return { jobId: live.jobId, status: live.status, startedAt: live.startedAt };
    }
    const last = lastJob.get(projectId);
    if (last) {
      return { jobId: last.jobId, status: last.status, startedAt: last.startedAt };
    }
    return null;
  }

  async function runJob(projectId: string, job: InFlightJob): Promise<void> {
    job.status = "running";
    let finalStatus: "idle" | "failed" = "idle";
    try {
      await worker(projectId);
    } catch {
      finalStatus = "failed";
      // Worker failures are swallowed — the queue's job is to serialize,
      // not to enforce projection success. The projection layer records its
      // own errors onto the project row. We still track the failure in
      // `lastJob` so `getStatus` can report it accurately.
    } finally {
      lastJob.set(projectId, {
        jobId: job.jobId,
        startedAt: job.startedAt,
        status: finalStatus,
      });
      inFlight.delete(projectId);
    }
  }

  function enqueue(projectId: string): Promise<EnqueueResult> {
    const existing = inFlight.get(projectId);
    if (existing) {
      // Coalesce: resolve with the same job descriptor. Status is "running"
      // because by the time a second enqueue can observe the in-flight map,
      // the runner microtask has flipped the status.
      const snapshot: EnqueueResult = {
        jobId: existing.jobId,
        status: existing.status === "queued" ? "queued" : "running",
        projectId,
      };
      return Promise.resolve(snapshot);
    }

    const jobId = randomUUID();
    const startedAt = new Date();
    const job: InFlightJob = {
      jobId,
      projectId,
      startedAt,
      status: "queued",
      // Placeholder; overwritten below before the runner kicks off.
      completion: Promise.resolve({ jobId, status: "queued", projectId }),
    };
    inFlight.set(projectId, job);

    const completion = (async (): Promise<EnqueueResult> => {
      // Kick off the worker on the next microtask so synchronous callers see
      // the "queued" state and concurrent enqueues coalesce before status
      // flips to "running".
      const result: EnqueueResult = { jobId, status: "queued", projectId };
      // Chain the run; `runJob` mutates `job.status` and cleans up.
      void runJob(projectId, job);
      return result;
    })();

    job.completion = completion;
    return completion;
  }

  function clear(): void {
    inFlight.clear();
    lastJob.clear();
  }

  return { enqueue, getStatus, clear };
}
