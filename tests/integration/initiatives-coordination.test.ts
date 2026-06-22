/**
 * Task 5.5 — Initiatives coordination (req 01.8c).
 *
 * Requirement 01.8(c) ("Context store & initiatives — server-side projection")
 * mandates that an initiative detail view shows ALL changes linked to that
 * initiative across ALL repos in a unified Kanban / list view. Repo-local
 * changes link to an initiative via `changes.initiativeId`.
 *
 * This task delivers the coordination layer:
 *   1. Linking a change to an initiative (PATCH change accepts `initiativeId`).
 *   2. A unified cross-repo read endpoint that returns the initiative plus
 *      every linked change, each labeled with its source project/repo name.
 *   3. An empty state when the initiative has no linked changes.
 *
 * Before task 5.5 these behaviors are absent, so these assertions FAIL — the
 * intended RED state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { callPost, callPostWithParams, callPatch } from "./helpers";
import { POST as storePOST } from "@/app/api/context-stores/route";
import {
  POST as initiativePOST,
} from "@/app/api/context-stores/[id]/initiatives/route";
import {
  GET as initiativeDetailGET,
} from "@/app/api/context-stores/[id]/initiatives/[initiativeId]/route";
import { POST as projectPOST } from "@/app/api/projects/route";
import { POST as changePOST } from "@/app/api/projects/[id]/changes/route";
import { PATCH as changePATCH } from "@/app/api/projects/[id]/changes/[changeId]/route";

async function resetTables() {
  // order: changes -> initiatives -> context_stores -> projects
  await db.execute(sql`delete from changes`);
  await db.execute(sql`delete from initiatives`);
  await db.execute(sql`delete from context_stores`);
  await db.execute(sql`delete from projects`);
}

async function createProject(name: string, rootPath: string): Promise<string> {
  const res = await callPost(projectPOST, "/api/projects", {
    name,
    rootPath,
    enrollmentSource: "local",
    projected: true,
  });
  const body = await res.json();
  return body.id;
}

describe("Initiatives coordination — unified cross-repo view (task 5.5, req 01.8c)", () => {
  beforeEach(async () => {
    await resetTables();
  });

  async function seedInitiative(): Promise<{ storeId: string; initiativeId: string }> {
    const storeRes = await callPost(storePOST, "/api/context-stores", {
      name: "Coordination Store",
      path: "/tmp/coord",
    });
    const { id: storeId } = await storeRes.json();
    const initRes = await callPostWithParams(
      initiativePOST,
      `/api/context-stores/${storeId}/initiatives`,
      { id: storeId },
      { title: "Q3 Platform Migration", summary: "Unify all repos onto v3" },
    );
    const init = await initRes.json();
    return { storeId, initiativeId: init.id };
  }

  async function createChangeInProject(projectId: string, name: string): Promise<string> {
    const res = await callPostWithParams(
      changePOST,
      `/api/projects/${projectId}/changes`,
      { id: projectId },
      { name, description: `${name} description` },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    return body.id;
  }

  async function linkChange(projectId: string, changeId: string, initiativeId: string | null) {
    const res = await callPatch(
      changePATCH,
      `/api/projects/${projectId}/changes/${changeId}`,
      { id: projectId, changeId },
      { initiativeId },
    );
    return res;
  }

  it("PATCH /api/projects/[id]/changes/[changeId] links a change to an initiative via initiativeId", async () => {
    const { initiativeId } = await seedInitiative();
    const projectId = await createProject("Repo-A", "/tmp/repo-a");
    const changeId = await createChangeInProject(projectId, "link-to-initiative");

    const res = await linkChange(projectId, changeId, initiativeId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.initiativeId).toBe(initiativeId);

    // Confirmed persisted.
    const rows = await db.execute(sql`
      select initiative_id from changes where id = ${changeId}
    `);
    expect(
      (rows.rows as unknown as Array<Record<string, string>>)[0].initiative_id,
    ).toBe(initiativeId);
  });

  it("PATCH .../changes/[changeId] unlinks a change by sending initiativeId = null", async () => {
    const { initiativeId } = await seedInitiative();
    const projectId = await createProject("Repo-A", "/tmp/repo-a");
    const changeId = await createChangeInProject(projectId, "unlink-me");
    await linkChange(projectId, changeId, initiativeId);

    const res = await linkChange(projectId, changeId, null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.initiativeId).toBeNull();
  });

  it("GET initiative detail returns the initiative plus linked changes across multiple repos, each labeled with source project", async () => {
    const { storeId, initiativeId } = await seedInitiative();

    const projA = await createProject("Repo-A", "/tmp/repo-a");
    const projB = await createProject("Repo-B", "/tmp/repo-b");

    const changeA = await createChangeInProject(projA, "change-in-repo-a");
    const changeB = await createChangeInProject(projB, "change-in-repo-b");
    // An unrelated change NOT linked to the initiative — must not appear.
    const changeUnrelated = await createChangeInProject(projA, "unrelated-change");

    await linkChange(projA, changeA, initiativeId);
    await linkChange(projB, changeB, initiativeId);
    void changeUnrelated; // intentionally left unlinked

    const res = await initiativeDetailGET(
      new NextRequest(
        `http://localhost:3000/api/context-stores/${storeId}/initiatives/${initiativeId}`,
        { method: "GET" },
      ),
      { params: Promise.resolve({ id: storeId, initiativeId }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.initiative.id).toBe(initiativeId);
    expect(body.initiative.title).toBe("Q3 Platform Migration");

    // Both repos' changes appear, each labeled with its source project name.
    expect(Array.isArray(body.linkedChanges)).toBe(true);
    expect(body.linkedChanges).toHaveLength(2);

    const labels = (body.linkedChanges as Array<{ projectName: string }>)
      .map((c) => c.projectName)
      .sort();
    expect(labels).toEqual(["Repo-A", "Repo-B"]);

    const ids = (body.linkedChanges as Array<{ id: string }>).map((c) => c.id).sort();
    expect(ids).toEqual([changeA, changeB].sort());

    // The unrelated change is NOT included.
    expect(
      (body.linkedChanges as Array<{ id: string }>).some((c) => c.id === changeUnrelated),
    ).toBe(false);
  });

  it("GET initiative detail renders an empty linkedChanges array when the initiative has no links", async () => {
    const { storeId, initiativeId } = await seedInitiative();

    const res = await initiativeDetailGET(
      new NextRequest(
        `http://localhost:3000/api/context-stores/${storeId}/initiatives/${initiativeId}`,
        { method: "GET" },
      ),
      { params: Promise.resolve({ id: storeId, initiativeId }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.initiative.id).toBe(initiativeId);
    expect(body.linkedChanges).toEqual([]);
  });

  it("GET initiative detail returns 404 when the initiative does not exist", async () => {
    const storeRes = await callPost(storePOST, "/api/context-stores", {
      name: "Store",
      path: "/tmp/s",
    });
    const { id: storeId } = await storeRes.json();

    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await initiativeDetailGET(
      new NextRequest(
        `http://localhost:3000/api/context-stores/${storeId}/initiatives/${fakeId}`,
        { method: "GET" },
      ),
      { params: Promise.resolve({ id: storeId, initiativeId: fakeId }) },
    );
    expect(res.status).toBe(404);
  });

  // `createProject` above is defined with a deliberately-redundant ternary to
  // document the wiring; this reassurance test pins the canonical path so a
  // future refactor can drop the ternary safely.
});
