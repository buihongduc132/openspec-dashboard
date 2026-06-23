/**
 * Task 5.11 (GREEN) — process-wide singletons for the Phase-1-stand-in stub
 * mutation route (change `phase0-foundations`, spec `audit-chain`, req
 * "Audit-emission contract on mutating endpoints (NFR-10)"; design D0-7).
 *
 * The stub route wires THREE concerns together — ETag, audit emission, and
 * quarantine gating — each of which has a test-injectable dependency:
 *   - the {@link AuditAppendQueue} (audit emission),
 *   - the {@link QuarantineState} (mutation gating),
 *   - the {@link SectionEtagStore} (optimistic concurrency).
 *
 * Production wires process-wide singletons lazily (constructed on first
 * access); tests install an override via {@link setStubMutateRuntimeForTest}
 * so the contract test runs against an in-memory fake queue that captures
 * emitted entries. This mirrors the projection layer's
 * `getProjectionQueue` / `resetProjectionQueue` pattern.
 *
 * **STUB ONLY (design D0-7):** these singletons exist solely to prove the
 * middleware + emission contract end-to-end at the Phase 0 boundary. Phase 1
 * wires real mutating endpoints (with real project-root resolution + the
 * persisted {@link PersistentEtagStore}); this module + the `__stub` route
 * are REMOVED at the Phase 1 boundary. The `__stub` namespace makes the
 * removal greppable and the testing-standard knip gate flags leftover refs.
 */
import { randomUUID } from "node:crypto";
import {
  createAppendQueue,
  type AppendQueueFs,
  type AuditAppendQueue,
} from "./append-queue";
import { createQuarantineState, type QuarantineState } from "./quarantine";
import { SectionEtagStore } from "@/lib/section-etag";
import { resolveSidecar } from "@/lib/projection/sidecar";

/** The bundled runtime dependencies for the stub mutation route. */
export interface StubMutateRuntime {
  /** Audit append queue (the filesystem chain writer). */
  queue: AuditAppendQueue;
  /** Deployment-wide quarantine state. */
  quarantine: QuarantineState;
  /** In-memory section ETag store (stub-only; Phase 1 wires the persisted store). */
  store: SectionEtagStore;
}

/** Test override (null = use production singletons). */
let override: StubMutateRuntime | null = null;

/** Process-wide production singletons (lazily constructed). */
let production: StubMutateRuntime | null = null;

/**
 * Return the active stub-mutate runtime. Tests install an override via
 * {@link setStubMutateRuntimeForTest}; production lazily constructs
 * process-wide singletons bound to the real filesystem sidecar.
 */
export function getStubMutateRuntime(): StubMutateRuntime {
  if (override !== null) return override;
  if (production === null) {
    production = buildProductionRuntime();
  }
  return production;
}

/**
 * TEST-ONLY seam: install (or clear) an in-memory runtime so the NFR-10
 * contract test runs against a capturing fake queue. Pass `null` to restore
 * production singletons.
 */
export function setStubMutateRuntimeForTest(rt: StubMutateRuntime | null): void {
  override = rt;
}

/** Construct the production singletons bound to the real filesystem sidecar. */
function buildProductionRuntime(): StubMutateRuntime {
  const queue = createAppendQueue(nodeAuditFs, auditPathResolver);
  const quarantine = createQuarantineState();
  const store = new SectionEtagStore();
  return { queue, quarantine, store };
}

/**
 * Resolve a projectId to its on-disk audit file path under the sidecar
 * location. STUB-ONLY: uses `process.cwd()` as the project root because the
 * stub has no real project mapping; Phase 1 wires the real per-project root.
 */
function auditPathResolver(projectId: string): string {
  return resolveSidecar(process.cwd(), `audit/${projectId}.log`);
}

/** Correlation ID generator (overridable for deterministic tests). */
export const newRequestId: () => string = randomUUID;

/** Default production filesystem binding for the audit append queue. */
const nodeAuditFs: AppendQueueFs = {
  async mkdir(dir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  },
  async readFile(path) {
    const { readFile } = await import("node:fs/promises");
    try {
      return await readFile(path, "utf8");
    } catch (err) {
      // Re-shape to the AppendQueueFs ENOENT contract (node already sets code).
      throw err;
    }
  },
  async appendFile(path, data) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(path, data, "utf8");
  },
};
