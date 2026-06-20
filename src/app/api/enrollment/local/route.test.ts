/**
 * Task 3.3 — `POST /api/enrollment/local`: validate path against allow-list,
 * detect `openspec/config.yaml`.
 *
 * This endpoint is the first half of the local-enrollment server flow. Given a
 * candidate directory path it MUST:
 *   1. Reject empty/missing paths (400).
 *   2. Reject paths outside the operator-configured enrollment allow-list (403)
 *      with NO filesystem mutation.
 *   3. Reject paths that do not exist as a directory (404).
 *   4. For a valid, in-allow-list directory: report whether it is already an
 *      OpenSpec project (`openspec/config.yaml` present) via a 200 response
 *      carrying `{ path, isOpenSpec }`.
 *
 * It deliberately does NOT enroll the project (task 3.5) nor run `openspec
 * init` (task 3.4) — it only validates + detects.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

async function post(body: unknown): Promise<Response> {
  const url = "http://localhost:3000/api/enrollment/local";
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Import lazily inside each test so env mutations are picked up.
  const { POST } = await import("@/app/api/enrollment/local/route");
  return POST(req);
}

describe("POST /api/enrollment/local — validate + detect (task 3.3)", () => {
  const ORIGINAL_ENV = process.env;
  let tmpRoot: string;
  let openspecDir: string;
  let plainDir: string;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // Lock the allow-list to a fresh temp root we fully control.
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enroll-3.3-"));
    process.env.OPENSPEC_DASHBOARD_ENROLL_ROOTS = tmpRoot;

    plainDir = path.join(tmpRoot, "plain");
    fs.mkdirSync(plainDir, { recursive: true });

    openspecDir = path.join(tmpRoot, "with-openspec");
    fs.mkdirSync(path.join(openspecDir, "openspec"), { recursive: true });
    fs.writeFileSync(
      path.join(openspecDir, "openspec", "config.yaml"),
      "schema: spec-driven\n",
    );
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("rejects an empty/missing path with 400", async () => {
    const res = await post({ path: "" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects a path outside the allow-list with 403", async () => {
    const res = await post({ path: "/etc/passwd" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects a nonexistent in-allow-list path with 404", async () => {
    const res = await post({ path: path.join(tmpRoot, "does-not-exist") });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("detects an existing OpenSpec project (isOpenSpec = true)", async () => {
    const res = await post({ path: openspecDir });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe(openspecDir);
    expect(body.isOpenSpec).toBe(true);
  });

  it("detects a non-OpenSpec directory (isOpenSpec = false)", async () => {
    const res = await post({ path: plainDir });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe(plainDir);
    expect(body.isOpenSpec).toBe(false);
  });
});
