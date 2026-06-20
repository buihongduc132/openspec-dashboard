/**
 * Task 3.4 — When a candidate directory is NOT an OpenSpec project, the UI
 * offers to run `openspec init`. On user acceptance the dashboard MUST run the
 * configured OpenSpec CLI's `init` command in that directory via a *typed*
 * child process and stream the combined stdout/stderr back to the caller.
 *
 * This file tests the server endpoint that performs that run:
 * `POST /api/enrollment/init`. The child-process behaviour itself is covered
 * by `src/lib/openspec-init.test.ts`; here we mock `@/lib/openspec-init` so we
 * can drive the event stream without spawning a real process.
 *
 * Behaviour covered:
 *   1. Rejects empty / non-string / missing path (400) — never spawns.
 *   2. Rejects paths outside the operator allow-list (403) — never spawns.
 *   3. Rejects paths that do not exist as a directory (404) — never spawns.
 *   4. On a valid in-allow-list directory, runs the helper with `cwd` set to
 *      that directory and streams a `text/event-stream` response carrying the
 *      stdout/stderr/exit events.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { InitStreamEvent } from "@/lib/openspec-init";

/** Mutable events the mocked `spawnOpenSpecInit` will emit this run. */
let mockEvents: InitStreamEvent[] = [];
/** Captures the `cwd` passed to the mock each run. */
let capturedCwd: string | undefined;

vi.mock("@/lib/openspec-init", () => ({
  spawnOpenSpecInit: (cwd: string) => {
    capturedCwd = cwd;
    const events = mockEvents;
    async function* gen(): AsyncIterable<InitStreamEvent> {
      for (const e of events) yield e;
    }
    return { child: null, events: gen() };
  },
}));

/** Drain a streaming Response body to a UTF-8 string. */
async function drain(res: Response): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  const reader = res.body?.getReader();
  if (!reader) return out;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

async function postInit(body: unknown): Promise<Response> {
  const url = "http://localhost:3000/api/enrollment/init";
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { POST } = await import("@/app/api/enrollment/init/route");
  return POST(req);
}

describe("POST /api/enrollment/init — validate + stream (task 3.4)", () => {
  const ORIGINAL_ENV = process.env;
  let tmpRoot: string;
  let plainDir: string;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enroll-3.4-"));
    process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = tmpRoot;

    plainDir = path.join(tmpRoot, "plain");
    fs.mkdirSync(plainDir, { recursive: true });

    mockEvents = [{ type: "exit", code: 0 }];
    capturedCwd = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = ORIGINAL_ENV;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("rejects an empty/missing path with 400 (never spawns)", async () => {
    const res = await postInit({ path: "" });
    expect(res.status).toBe(400);
    expect(capturedCwd).toBeUndefined();
  });

  it("rejects a path outside the allow-list with 403 (never spawns)", async () => {
    const res = await postInit({ path: "/etc/passwd" });
    expect(res.status).toBe(403);
    expect(capturedCwd).toBeUndefined();
  });

  it("rejects a nonexistent in-allow-list path with 404 (never spawns)", async () => {
    const res = await postInit({ path: path.join(tmpRoot, "nope") });
    expect(res.status).toBe(404);
    expect(capturedCwd).toBeUndefined();
  });

  it("spawns with cwd set to the chosen directory", async () => {
    mockEvents = [{ type: "exit", code: 0 }];
    const res = await postInit({ path: plainDir });
    expect(res.status).toBe(200);
    expect(capturedCwd).toBe(plainDir);
  });

  it("streams stdout, stderr and a terminal exit-code event as SSE", async () => {
    mockEvents = [
      { type: "stdout", data: "creating openspec/config.yaml\n" },
      { type: "stderr", data: "warning: dir already had files\n" },
      { type: "exit", code: 0 },
    ];

    const res = await postInit({ path: plainDir });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/i);

    const body = await drain(res);
    expect(body).toContain("creating openspec/config.yaml");
    expect(body).toContain("warning: dir already had files");
    expect(body).toMatch(/"type":"exit"/);
    expect(body).toMatch(/"code":0/);
  });

  it("still streams output when the CLI exits non-zero", async () => {
    mockEvents = [
      { type: "stderr", data: "Error: not a git repo\n" },
      { type: "exit", code: 2 },
    ];

    const res = await postInit({ path: plainDir });
    // HTTP status stays 200 (streamed); the failure is signalled in-band via
    // the streamed exit-code event, since the stream already started.
    expect(res.status).toBe(200);
    const body = await drain(res);
    expect(body).toContain("Error: not a git repo");
    expect(body).toMatch(/"code":2/);
  });
});
