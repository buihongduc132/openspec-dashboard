/**
 * Task 5.11 (GREEN) — NFR-10 audit-emission contract test against the
 * Phase-1-stand-in stub mutation route
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Audit-emission contract on mutating endpoints (NFR-10)"; design D0-7).
 *
 * The contract: "Every mutating endpoint SHALL emit an audit record. A
 * contract test SHALL fail if any mutating endpoint does not emit."
 *
 * Phase 0 has no real feature mutating endpoints, so this contract test
 * targets the stand-in `POST /api/__stub/mutate` route. It proves the full
 * middleware stack composes for a real mutating request:
 *
 *   - **NFR-10 emission:** a successful POST appends exactly one audit entry
 *     to the (injected) audit chain, and the response carries
 *     `x-audit-emission: emitted`.
 *   - **ETag (INV-7):** the response carries an `etag` header; a second
 *     same-section commit WITHOUT If-Match returns 428 (the section is now
 *     tracked), and WITH a stale If-Match returns 409.
 *   - **Quarantine:** while the deployment is quarantined, the POST returns
 *     503 and NO audit entry is emitted.
 *   - **Contract catches a missing emission:** a handler that returns 2xx
 *     WITHOUT going through {@link withAuditEmission} produces a response
 *     with NO `x-audit-emission` header — i.e. the contract surface itself
 *     is detectable, which is how Phase 1 routes will be gated.
 *
 * The route's runtime (queue / quarantine / store) is injected via
 * {@link setStubMutateRuntimeForTest} so the test runs against an in-memory
 * capturing queue with no filesystem or DB.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { handleStubMutate } from "./route";
import {
  setStubMutateRuntimeForTest,
  type StubMutateRuntime,
} from "@/lib/audit/server-runtime";
import { createAppendQueue, type AppendQueueFs } from "@/lib/audit/append-queue";
import { createQuarantineState } from "@/lib/audit/quarantine";
import { SectionEtagStore } from "@/lib/section-etag";
import { withAuditEmission } from "@/lib/audit/emit";
import type { ChainEntry, EntryBody } from "@/lib/audit/chain";
import { GENESIS_HASH } from "@/lib/audit/chain";

/** In-memory fake fs for the append queue (projectId → file contents). */
function makeFakeFs(): AppendQueueFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async mkdir() {
      /* no-op */
    },
    async readFile(path) {
      const v = files.get(path);
      if (v === undefined) {
        const err: NodeJS.ErrnoException = new Error(`ENOENT: ${path}`);
        err.code = "ENOENT";
        throw err;
      }
      return v;
    },
    async appendFile(path, data) {
      files.set(path, (files.get(path) ?? "") + data);
    },
  };
}

/** A runtime whose queue appends land in `appended` for contract assertions. */
function makeRuntime(): StubMutateRuntime & {
  appended: { projectId: string; body: EntryBody }[];
  fs: AppendQueueFs & { files: Map<string, string> };
} {
  const appended: { projectId: string; body: EntryBody }[] = [];
  const fs = makeFakeFs();
  const queue = createAppendQueue(fs, (projectId) => `/audit/${projectId}.log`);
  // Wrap append so the test observes emissions without breaking the chain.
  const origAppend = queue.append.bind(queue);
  queue.append = async (projectId, body) => {
    const entry = await origAppend(projectId, body);
    appended.push({ projectId, body });
    return entry;
  };
  return {
    queue,
    quarantine: createQuarantineState(),
    store: new SectionEtagStore(),
    appended,
    fs,
  };
}

/** Build a POST request to the stub route. */
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/__stub/mutate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setStubMutateRuntimeForTest(null);
});

describe("NFR-10 contract — stub mutation route emits an audit record", () => {
  it("appends exactly one audit entry on a successful POST and tags the response", async () => {
    const rt = makeRuntime();
    setStubMutateRuntimeForTest(rt);

    const res = await handleStubMutate(
      post({ projectId: "p-1", actor: "alice", entity: "task:t-1", payload: { x: 1 } }),
    );

    expect(res.status).toBe(200);
    // ETag middleware attached the new ETag (INV-7).
    expect(res.headers.get("etag")).toBeTruthy();
    // Audit emission ran (NFR-10).
    expect(res.headers.get("x-audit-emission")).toBe("emitted");

    // Exactly one audit entry was appended, against the right project.
    expect(rt.appended).toHaveLength(1);
    const [emission] = rt.appended;
    expect(emission.projectId).toBe("p-1");
    expect(emission.body.actor).toBe("alice");
    expect(emission.body.action).toBe("stub.mutate");
    expect(emission.body.entity).toBe("task:t-1");

    // The entry actually landed on the filesystem chain (chained from genesis).
    const log = rt.fs.files.get("/audit/p-1.log") ?? "";
    const entries = log
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ChainEntry);
    expect(entries).toHaveLength(1);
    expect(entries[0].prevHash).toBe(GENESIS_HASH);
    expect(entries[0].hash).toBeTruthy();
  });

  it("a second same-section commit without If-Match is rejected (428) and emits nothing", async () => {
    const rt = makeRuntime();
    setStubMutateRuntimeForTest(rt);

    // First commit = CREATE (exempt from If-Match) — section now tracked.
    const first = await handleStubMutate(post({ projectId: "p-1" }));
    expect(first.status).toBe(200);
    expect(rt.appended).toHaveLength(1);

    // Second commit, no If-Match → 428 (tracked section MUST present a valid ETag).
    // ETag middleware short-circuits: the handler never runs, so the emission
    // wrapper never runs either — no mutation from the chain's perspective.
    const second = await handleStubMutate(post({ projectId: "p-1" }));
    expect(second.status).toBe(428);
    // The emission header is absent because the handler was never invoked.
    expect(second.headers.get("x-audit-emission")).toBeNull();
    expect(rt.appended).toHaveLength(1);
  });

  it("a second same-section commit with a stale If-Match is rejected (409)", async () => {
    const rt = makeRuntime();
    setStubMutateRuntimeForTest(rt);

    const first = await handleStubMutate(post({ projectId: "p-1" }));
    expect(first.status).toBe(200);
    const currentEtag = first.headers.get("etag");
    expect(currentEtag).toBeTruthy();

    // Tampered/stale If-Match → 409.
    const second = await handleStubMutate(
      post({ projectId: "p-1" }, { "if-match": `"stale-${currentEtag}"` }),
    );
    expect(second.status).toBe(409);
    expect(rt.appended).toHaveLength(1);
  });
});

describe("NFR-10 contract — quarantine blocks the stub mutation and suppresses emission", () => {
  it("returns 503 and emits NO audit entry while the deployment is quarantined", async () => {
    const rt = makeRuntime();
    setStubMutateRuntimeForTest(rt);
    rt.quarantine.enter({
      projectId: "p-1",
      findings: [
        { index: 0, kind: "hash_mismatch", entry: {} as never },
      ],
    });

    const res = await handleStubMutate(post({ projectId: "p-1" }));

    expect(res.status).toBe(503);
    // The quarantine gate is OUTSIDE the emission middleware, so the request
    // never reaches emission: no audit entry is appended.
    expect(rt.appended).toHaveLength(0);
  });
});

describe("NFR-10 contract — catches a missing emission", () => {
  it("a mutating handler that bypasses withAuditEmission has no x-audit-emission header", async () => {
    // A route wired WITHOUT withAuditEmission (the omission NFR-10 guards
    // against): the response carries no `x-audit-emission` header, which is
    // the detectable surface the contract relies on.
    const rt = makeRuntime();
    const unWired = async () => NextResponse.json({ ok: true });

    const res = await unWired();
    expect(res.headers.get("x-audit-emission")).toBeNull();
    expect(rt.appended).toHaveLength(0);

    // The SAME handler wired THROUGH withAuditEmission emits + is tagged.
    const wired = withAuditEmission(unWired, {
      queue: rt.queue,
      projectIdResolver: () => "p-1",
      resolver: () => ({
        actor: "alice",
        action: "stub.mutate",
        entity: "stub:entity",
        beforeHash: "0".repeat(8),
        afterHash: "f".repeat(8),
        timestamp: Date.now(),
        requestId: "00000000-0000-0000-0000-000000000001",
      }),
    });
    const res2 = await wired(new Request("https://x/api/__stub/mutate", { method: "POST" }));
    expect(res2.headers.get("x-audit-emission")).toBe("emitted");
    expect(rt.appended).toHaveLength(1);
  });
});
