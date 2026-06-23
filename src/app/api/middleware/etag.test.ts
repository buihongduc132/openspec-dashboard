/**
 * Task 4.7 (RED) — per-section ETag HTTP middleware (INV-7).
 *
 * Drives `src/app/api/middleware/etag.ts` (task 4.8 GREEN) against the
 * filesystem-projection spec requirement "Per-section ETag concurrency
 * (INV-7)" and its four Phase-0 scenarios:
 *
 *  - "Different sections both succeed": two clients editing different sections
 *    of the same file, each sending a valid If-Match, both return 2xx.
 *  - "Same section conflict returns 409": the second commit to the SAME
 *    section (starting from the now-stale ETag) returns 409 with the current
 *    winning ETag + a merge-UI pointer.
 *  - "Missing If-Match on a mutation is rejected": a PUT/PATCH/DELETE mutating
 *    request omitting If-Match is rejected 428 BEFORE the handler runs.
 *  - "POST create is exempt from If-Match": a POST creating a new (untracked)
 *    section needs no If-Match.
 *
 * The in-memory {@link SectionEtagStore} primitive already exists (Task 1.9);
 * this middleware is the HTTP If-Match / 409 / 428 / ETag-header plumbing that
 * consumes it per design D0-4 (`withEtag(handler, sectionResolver)`).
 */
import { describe, it, expect, vi } from "vitest";
import { withEtag } from "@/app/api/middleware/etag";
import { SectionEtagStore } from "@/lib/section-etag";

/** Build a mutating Request with an optional If-Match and JSON body. */
function makeRequest(
  method: string,
  opts: { ifMatch?: string; body?: unknown },
): Request {
  const headers = new Headers();
  if (opts.ifMatch !== undefined) headers.set("if-match", opts.ifMatch);
  return new Request("https://dashboard.test/api/mutate", {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** Resolver that pulls (fileKey, sectionKey, sectionBytes) out of the body. */
function bodyResolver(req: Request, body: unknown) {
  const b = body as { file: string; section: string; bytes: string };
  return { fileKey: b.file, sectionKey: b.section, sectionBytes: b.bytes };
}

describe("task 4.7 — per-section ETag middleware (INV-7)", () => {
  it("two clients editing DIFFERENT sections both succeed", async () => {
    const store = new SectionEtagStore();
    const e5 = store.track("tasks.md", "line:5", "old-5");
    const e12 = store.track("tasks.md", "line:12", "old-12");

    const handler = vi.fn(async () => Response.json({ ok: true }, { status: 200 }));
    const wrap = withEtag(handler, bodyResolver, { store });

    const r5 = await wrap(
      makeRequest("PUT", {
        ifMatch: e5,
        body: { file: "tasks.md", section: "line:5", bytes: "new-5" },
      }),
    );
    const r12 = await wrap(
      makeRequest("PUT", {
        ifMatch: e12,
        body: { file: "tasks.md", section: "line:12", bytes: "new-12" },
      }),
    );

    expect(r5.status).toBe(200);
    expect(r12.status).toBe(200);
    // Both edits landed (handler invoked once per accepted commit).
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("same-section second commit returns 409 with the current ETag + merge-UI pointer", async () => {
    const store = new SectionEtagStore();
    const eStart = store.track("tasks.md", "line:5", "old-5");

    const handler = vi.fn(async () => Response.json({ ok: true }, { status: 200 }));
    const wrap = withEtag(handler, bodyResolver, { store });

    // A commits first from eStart.
    const rA = await wrap(
      makeRequest("PUT", {
        ifMatch: eStart,
        body: { file: "tasks.md", section: "line:5", bytes: "A-wins" },
      }),
    );
    expect(rA.status).toBe(200);
    const winningEtag = rA.headers.get("etag");
    expect(winningEtag).toBeTruthy();

    // B commits from the SAME (now-stale) eStart → 409.
    const rB = await wrap(
      makeRequest("PUT", {
        ifMatch: eStart,
        body: { file: "tasks.md", section: "line:5", bytes: "B-loses" },
      }),
    );
    expect(rB.status).toBe(409);
    const bBody = await rB.json();
    // The current (winning) ETag is surfaced so the client can re-merge.
    expect(bBody.etag).toBe(winningEtag);
    // A merge-UI pointer is included (Phase 0 returns the pointer only).
    expect(bBody.mergeUi).toBeTruthy();
    // The losing commit did NOT reach the handler.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("missing If-Match on a mutation is rejected with 428 before the handler runs", async () => {
    const store = new SectionEtagStore();
    store.track("tasks.md", "line:5", "old-5");

    const handler = vi.fn(async () => Response.json({ ok: true }, { status: 200 }));
    const wrap = withEtag(handler, bodyResolver, { store });

    const r = await wrap(
      makeRequest("PUT", {
        // If-Match deliberately omitted.
        body: { file: "tasks.md", section: "line:5", bytes: "new" },
      }),
    );

    expect(r.status).toBe(428);
    // The handler must NOT run on a rejected request.
    expect(handler).not.toHaveBeenCalled();
  });

  it("POST create of a new section is exempt from If-Match", async () => {
    const store = new SectionEtagStore();
    // line:99 is deliberately NOT tracked (a brand-new section).

    const handler = vi.fn(async () => Response.json({ ok: true }, { status: 201 }));
    const wrap = withEtag(handler, bodyResolver, { store });

    const r = await wrap(
      makeRequest("POST", {
        // No If-Match — exempt for a create.
        body: { file: "tasks.md", section: "line:99", bytes: "created" },
      }),
    );

    expect(r.status).toBe(201);
    // The new ETag for the freshly-created section is returned.
    expect(r.headers.get("etag")).toBeTruthy();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
