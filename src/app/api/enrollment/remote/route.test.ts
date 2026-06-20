/**
 * Task 4.3 — `POST /api/enrollment/remote`: on matched + authenticated CLI,
 * register the project as a pending remote-git enrollment and return the
 * explicit "planned — full clone lands with git integration" message.
 *
 * Spec requirement "Remote git enrollment via gh / glab (planned, stubbed)",
 * scenario "Detect authenticated gh CLI for a GitHub URL":
 *   WHEN the user pastes `https://github.com/org/repo` and `gh auth status`
 *   reports authenticated, THEN the flow records `enrollmentSource =
 *   "remote-git"` and `remoteGitUrl`, and informs the user that full clone +
 *   projection is pending a later change.
 *
 * These tests mock the CLI-detection helper and the DB so the route handler
 * can be exercised in the unit suite (no real `gh`/`glab`, no Postgres).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type { RemoteCliCheckResult } from "@/lib/cli-auth";

// --- Mocks --------------------------------------------------------------

// Capture what the route inserts into the projects table.
const insertValues: Record<string, unknown> = {};
const returnedProject = {
  id: "proj-123",
  name: "repo",
  enrollmentSource: "remote-git",
  remoteGitUrl: "https://github.com/org/repo",
  projected: false,
  rootPath: null,
};

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        Object.assign(insertValues, v);
        return { returning: () => [returnedProject] };
      },
    })),
  },
}));

// Default detection result: an authenticated gh for a github.com URL.
let detection: RemoteCliCheckResult = {
  url: "https://github.com/org/repo",
  host: "github.com",
  requiredCli: "gh",
  cliResult: {
    status: "ok",
    authenticated: true,
    host: "github.com",
    user: "octocat",
  },
  actionable: true,
  message: "gh is authenticated for github.com.",
};

vi.mock("@/lib/cli-auth", () => ({
  checkRemoteCliAuth: vi.fn(async () => detection),
}));

async function post(body: unknown): Promise<Response> {
  const url = "http://localhost:3000/api/enrollment/remote";
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { POST } = await import("@/app/api/enrollment/remote/route");
  return POST(req);
}

describe("POST /api/enrollment/remote — pending remote enrollment (task 4.3)", () => {
  beforeEach(() => {
    for (const k of Object.keys(insertValues)) delete insertValues[k];
    detection = {
      url: "https://github.com/org/repo",
      host: "github.com",
      requiredCli: "gh",
      cliResult: {
        status: "ok",
        authenticated: true,
        host: "github.com",
        user: "octocat",
      },
      actionable: true,
      message: "gh is authenticated for github.com.",
    };
  });

  it("registers a pending remote project when gh is authenticated", async () => {
    const res = await post({ remoteUrl: "https://github.com/org/repo" });
    expect(res.status).toBe(201);
    const body = await res.json();

    // Persisted enrollment metadata (task 4.3).
    expect(insertValues.enrollmentSource).toBe("remote-git");
    expect(insertValues.remoteGitUrl).toBe("https://github.com/org/repo");
    expect(insertValues.projected).toBe(false);

    // The created project is echoed back.
    expect(body.project.id).toBe("proj-123");
    expect(body.project.enrollmentSource).toBe("remote-git");
    expect(body.project.projected).toBe(false);
  });

  it('returns an explicit "planned — full clone lands with git integration" message', async () => {
    const res = await post({ remoteUrl: "https://github.com/org/repo" });
    const body = await res.json();
    expect(body.message).toMatch(/planned/i);
    expect(body.message).toMatch(/full clone lands with git integration/i);
  });

  it("works for an authenticated glab / gitlab.com URL", async () => {
    detection = {
      url: "https://gitlab.com/org/repo",
      host: "gitlab.com",
      requiredCli: "glab",
      cliResult: {
        status: "ok",
        authenticated: true,
        host: "gitlab.com",
      },
      actionable: true,
      message: "glab is authenticated for gitlab.com.",
    };

    const res = await post({ remoteUrl: "https://gitlab.com/org/repo" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(insertValues.remoteGitUrl).toBe("https://gitlab.com/org/repo");
    expect(insertValues.enrollmentSource).toBe("remote-git");
    expect(insertValues.projected).toBe(false);
    expect(body.message).toMatch(/planned/i);
  });

  it("rejects an empty/missing URL with 400 and does not enroll", async () => {
    const res = await post({ remoteUrl: "" });
    expect(res.status).toBe(400);
    expect(Object.keys(insertValues).length).toBe(0);
  });

  it("does NOT enroll when no CLI matches / is authenticated", async () => {
    detection = {
      url: "https://gitlab.com/org/repo",
      host: "gitlab.com",
      requiredCli: "glab",
      cliResult: { status: "missing", reason: "glab not on PATH" },
      actionable: false,
      message: "glab is required but not installed.",
    };

    const res = await post({ remoteUrl: "https://gitlab.com/org/repo" });
    expect(res.status).toBe(409);
    expect(Object.keys(insertValues).length).toBe(0);
  });
});
