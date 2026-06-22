/**
 * Task 5.3 — Workspaces write flows (req 01.7).
 *
 * Requirement 01.7 ("Workspace — multi-repo coordination") mandates that the
 * dashboard be able to create / list / edit coordination workspaces that link
 * multiple registered projects with stable aliases and an opener tool. The
 * workspace manifest is stored server-side under the dashboard-private root
 * (the `workspaces` + `workspace_links` tables in the dashboard DB), NOT as
 * an invented upstream file.
 *
 * Task 2.12 delivered a read-only workspaces page shell. Before task 5.3 there
 * are no API write endpoints for workspaces (no POST/PATCH/DELETE for
 * workspaces or links), so these assertions FAIL against the missing handlers
 * — the intended RED state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { callPost, callPostWithParams, callPatch, callDelete } from "./helpers";
import { POST as workspacePOST, GET as workspaceGET } from "@/app/api/workspaces/route";
import {
  GET as workspaceDetailGET,
  PATCH as workspacePATCH,
  DELETE as workspaceDELETE,
} from "@/app/api/workspaces/[id]/route";
import {
  POST as linkPOST,
  GET as linkGET,
} from "@/app/api/workspaces/[id]/links/route";
import {
  DELETE as linkDELETE,
} from "@/app/api/workspaces/[id]/links/[linkId]/route";

// Per-test isolation: truncate the workspace + project tables between cases so
// each assertion runs against a known-empty state. Order matters because of
// the workspace_links FK into both workspaces and projects.
async function resetTables() {
  await db.execute(sql`delete from workspace_links`);
  await db.execute(sql`delete from workspaces`);
  await db.execute(sql`delete from projects`);
}

async function seedProject(name: string, rootPath: string) {
  const res = await callPost(
    // Reuse the existing projects POST handler so the seeded project rows are
    // created through the same path as production code.
    (await import("@/app/api/projects/route")).POST,
    "/api/projects",
    { name, rootPath },
  );
  const body = await res.json();
  return body.id as string;
}

describe("Workspaces write flows (task 5.3, req 01.7)", () => {
  beforeEach(async () => {
    await resetTables();
  });

  it("POST /api/workspaces creates a workspace with name + opener", async () => {
    const res = await callPost(workspacePOST, "/api/workspaces", {
      name: "Coordination Workspace",
      opener: "code",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("Coordination Workspace");
    expect(body.opener).toBe("code");

    // Confirm the row is truly persisted (not just echoed).
    const result = await db.execute(sql`
      select name, opener from workspaces where id = ${body.id}
    `);
    const row = (result.rows as unknown as Array<Record<string, unknown>>)[0];
    expect(row.name).toBe("Coordination Workspace");
    expect(row.opener).toBe("code");
  });

  it("POST /api/workspaces rejects a missing name with 400", async () => {
    const res = await callPost(workspacePOST, "/api/workspaces", { opener: "code" });
    expect(res.status).toBe(400);
  });

  it("GET /api/workspaces lists created workspaces", async () => {
    await callPost(workspacePOST, "/api/workspaces", { name: "WS-A", opener: "code" });
    await callPost(workspacePOST, "/api/workspaces", { name: "WS-B", opener: null });

    const res = await workspaceGET();
    const body = await res.json();
    const names = body.map((w: { name: string }) => w.name).sort();
    expect(names).toEqual(["WS-A", "WS-B"]);
  });

  it("PATCH /api/workspaces/[id] updates name and opener", async () => {
    const created = await callPost(workspacePOST, "/api/workspaces", {
      name: "Old Name",
      opener: "code",
    });
    const { id } = await created.json();

    const res = await callPatch(workspacePATCH, `/api/workspaces/${id}`, { id }, {
      name: "New Name",
      opener: "vim",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
    expect(body.opener).toBe("vim");
  });

  it("PATCH /api/workspaces/[id] returns 404 for an unknown workspace", async () => {
    const res = await callPatch(
      workspacePATCH,
      "/api/workspaces/00000000-0000-0000-0000-000000000000",
      { id: "00000000-0000-0000-0000-000000000000" },
      { name: "Ghost" },
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/workspaces/[id]/links adds a linked project with a stable alias", async () => {
    const wsRes = await callPost(workspacePOST, "/api/workspaces", { name: "Links WS" });
    const { id: workspaceId } = await wsRes.json();
    const projectId = await seedProject("Linked Repo", "/tmp/linked-repo");

    const res = await callPostWithParams(linkPOST, `/api/workspaces/${workspaceId}/links`, { id: workspaceId }, {
      projectId,
      linkName: "core",
      localPath: "/tmp/linked-repo",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.projectId).toBe(projectId);
    expect(body.linkName).toBe("core");
    expect(body.localPath).toBe("/tmp/linked-repo");
  });

  it("GET /api/workspaces/[id]/links lists the linked projects", async () => {
    const wsRes = await callPost(workspacePOST, "/api/workspaces", { name: "List Links WS" });
    const { id: workspaceId } = await wsRes.json();
    const projectId = await seedProject("Linked Repo", "/tmp/linked-repo");
    await callPostWithParams(linkPOST, `/api/workspaces/${workspaceId}/links`, { id: workspaceId }, {
      projectId,
      linkName: "core",
      localPath: "/tmp/linked-repo",
    });

    const res = await linkGET(
      new NextRequest(`http://localhost:3000/api/workspaces/${workspaceId}/links`, { method: "GET" }),
      { params: Promise.resolve({ id: workspaceId }) },
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].linkName).toBe("core");
  });

  it("DELETE /api/workspaces/[id]/links/[linkId] removes the link", async () => {
    const wsRes = await callPost(workspacePOST, "/api/workspaces", { name: "Del Link WS" });
    const { id: workspaceId } = await wsRes.json();
    const projectId = await seedProject("Linked Repo", "/tmp/linked-repo");
    const linkRes = await callPostWithParams(linkPOST, `/api/workspaces/${workspaceId}/links`, { id: workspaceId }, {
      projectId,
      linkName: "core",
      localPath: "/tmp/linked-repo",
    });
    const link = await linkRes.json();

    const res = await callDelete(
      linkDELETE,
      `/api/workspaces/${workspaceId}/links/${link.id}`,
      { id: workspaceId, linkId: link.id },
    );
    expect(res.status).toBe(200);

    const remaining = await db.execute(sql`
      select count(*)::int as n from workspace_links where id = ${link.id}
    `);
    const row = (remaining.rows as unknown as Array<Record<string, number>>)[0];
    expect(row.n).toBe(0);
  });

  it("DELETE /api/workspaces/[id] removes the workspace and cascades to links", async () => {
    const wsRes = await callPost(workspacePOST, "/api/workspaces", { name: "Cascade WS" });
    const { id: workspaceId } = await wsRes.json();
    const projectId = await seedProject("Linked Repo", "/tmp/linked-repo");
    await callPostWithParams(linkPOST, `/api/workspaces/${workspaceId}/links`, { id: workspaceId }, {
      projectId,
      linkName: "core",
      localPath: "/tmp/linked-repo",
    });

    const res = await callDelete(workspaceDELETE, `/api/workspaces/${workspaceId}`, { id: workspaceId });
    expect(res.status).toBe(200);

    const wsRows = await db.execute(sql`
      select count(*)::int as n from workspaces where id = ${workspaceId}
    `);
    expect((wsRows.rows as unknown as Array<Record<string, number>>)[0].n).toBe(0);

    const linkRows = await db.execute(sql`
      select count(*)::int as n from workspace_links where workspace_id = ${workspaceId}
    `);
    expect((linkRows.rows as unknown as Array<Record<string, number>>)[0].n).toBe(0);
  });
});
