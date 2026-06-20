/**
 * Task 1.4 — `POST /api/projects` accepts and persists enrollment metadata.
 *
 * The collective-dashboard change adds three columns to the `projects` table
 * (tasks 1.1 / 1.2):
 *   - `enrollmentSource` ("local" | "remote-git", default "local")
 *   - `remoteGitUrl`    (text, nullable)
 *   - `projected`       (boolean, default false)
 *
 * Task 1.4 updates the `POST /api/projects` handler to accept and persist
 * those fields so the enrollment flows (local + stubbed remote-git) can record
 * how a project entered the collective dashboard.
 *
 * These tests exercise the route handler end-to-end against the testcontainer
 * DB (migrated by global-setup). Before task 1.4 the handler ignores the new
 * body fields, so persisted rows fall back to DB defaults (`local` / null /
 * false) and these assertions FAIL — the intended RED state.
 */
import { describe, it, expect } from "vitest";
import "./setup";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { callPost } from "./helpers";
import { POST } from "@/app/api/projects/route";

describe("POST /api/projects — enrollment metadata (task 1.4)", () => {
  it("persists enrollmentSource = 'local' and projected = true for a local enrollment", async () => {
    const res = await callPost(POST, "/api/projects", {
      name: "Local Enrollment Project",
      rootPath: "/tmp/local-enrollment",
      enrollmentSource: "local",
      projected: true,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.enrollmentSource).toBe("local");
    expect(body.projected).toBe(true);
    expect(body.remoteGitUrl).toBeNull();
  });

  it("persists enrollmentSource = 'remote-git', remoteGitUrl, projected = false for a stubbed remote enrollment", async () => {
    const res = await callPost(POST, "/api/projects", {
      name: "Remote Enrollment Project",
      rootPath: "/tmp/remote-enrollment",
      enrollmentSource: "remote-git",
      remoteGitUrl: "https://github.com/org/repo",
      projected: false,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.enrollmentSource).toBe("remote-git");
    expect(body.remoteGitUrl).toBe("https://github.com/org/repo");
    expect(body.projected).toBe(false);
  });

  it("applies sensible defaults when enrollment fields are omitted (back-compat)", async () => {
    // Pre-existing callers that do not send the new fields must keep working:
    // the row is created with the DB-backed defaults.
    const res = await callPost(POST, "/api/projects", {
      name: "Default Enrollment Project",
      rootPath: "/tmp/default-enrollment",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.enrollmentSource).toBe("local");
    expect(body.projected).toBe(false);
    expect(body.remoteGitUrl).toBeNull();
  });

  it("round-trips the persisted row through the database", async () => {
    // Confirms the values are truly persisted (not just echoed in the
    // response), by reading the row back out of the testcontainer DB.
    const res = await callPost(POST, "/api/projects", {
      name: "Round-Trip Project",
      rootPath: "/tmp/round-trip",
      enrollmentSource: "remote-git",
      remoteGitUrl: "https://gitlab.com/org/repo",
      projected: false,
    });
    const body = await res.json();

    const result = await db.execute(sql`
      select enrollment_source, remote_git_url, projected
      from projects
      where id = ${body.id}
    `);
    const row = (result.rows as unknown as Array<Record<string, unknown>>)[0];
    expect(row.enrollment_source).toBe("remote-git");
    expect(row.remote_git_url).toBe("https://gitlab.com/org/repo");
    expect(row.projected).toBe(false);
  });
});
