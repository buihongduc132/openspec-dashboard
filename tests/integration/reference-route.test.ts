/**
 * Integration test for the `/api/reference/[type]/[id]` GET endpoint
 * (tasks 2.1 and 2.2).
 *
 * Covers:
 *  - 400 + taxonomy JSON body when `type` is unsupported (task 2.1).
 *  - 200 + canonical `buildEntityReference` payload JSON for a supported kind
 *    (exercised end-to-end against the testcontainer DB: seed row → Drizzle
 *    fetch → builder → JSON) (task 2.1).
 *  - 404 + JSON error body when the entity id is missing, with NO internal
 *    paths leaking in the error message (task 2.2).
 *
 * Note: the testcontainer harness runs no Drizzle migrations (none exist in
 * this repo), so this test creates the narrow set of tables it touches via
 * raw SQL in `beforeAll`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "./setup";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, schemas, changes, tasks } from "@/db/schema";
import { GET } from "@/app/api/reference/[type]/[id]/route";

/** Invoke the dynamic-param GET handler in-process. */
async function callReferenceGet(type: string, id: string): Promise<Response> {
  const url = `http://localhost:3000/api/reference/${type}/${id}`;
  const req = new NextRequest(url, { method: "GET" });
  return GET(req, { params: Promise.resolve({ type, id }) });
}

beforeAll(async () => {
  // Create only the tables this test touches (no migrations exist in-repo).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id uuid primary key default gen_random_uuid(),
      name varchar not null,
      description text,
      root_path text not null,
      default_schema varchar default 'spec-driven',
      context text,
      config_yaml text,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schemas (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      name varchar not null,
      description text,
      source varchar default 'project' not null,
      definition text not null,
      is_active boolean default false,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS changes (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      name varchar not null,
      schema varchar default 'spec-driven',
      status varchar default 'proposed' not null,
      description text,
      initiative_id uuid,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id uuid primary key default gen_random_uuid(),
      change_id uuid not null references changes(id) on delete cascade,
      project_id uuid not null references projects(id) on delete cascade,
      group_title varchar default 'General',
      task_number varchar not null,
      title varchar not null,
      description text,
      status varchar default 'backlog' not null,
      assignee varchar,
      priority varchar default 'medium',
      labels text default '[]',
      due_date timestamp,
      order_index integer default 0,
      checked boolean default false,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    );
  `);
});

describe("GET /api/reference/[type]/[id] (task 2.1)", () => {
  it("returns 400 with the supported-type taxonomy when type is unsupported", async () => {
    const res = await callReferenceGet("unsupportedType", "x");
    expect(res.status).toBe(400);
    const body = await res.json();
    // Body identifies the unsupported type and lists the supported taxonomy
    expect(body.error).toMatch(/unsupported/i);
    expect(Array.isArray(body.supportedTypes)).toBe(true);
    expect(body.supportedTypes).toEqual(
      expect.arrayContaining([
        "project",
        "change",
        "spec",
        "spec-domain",
        "requirement",
        "task",
        "schema",
        "context-store",
        "workspace",
        "initiative",
      ]),
    );
    // No internal paths leak in the error body
    expect(JSON.stringify(body)).not.toContain("/home/");
  });

  it("returns 200 with a canonical reference payload for a project", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "Reference Test Project",
        rootPath: "/tmp/ref-test-repo",
      })
      .returning();

    const res = await callReferenceGet("project", project.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("project");
    expect(body.id).toBe(project.id);
    expect(body.title).toBe("Reference Test Project");
    expect(body.path).toBe("/tmp/ref-test-repo");
    expect(typeof body.readInstruction).toBe("string");
    expect(body.readInstruction.length).toBeGreaterThan(0);
    expect(body.metadata).toEqual(expect.any(Object));
    expect(body.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    );
    // No nulls in metadata
    expect(Object.values(body.metadata)).not.toContain(null);
  });

  it("returns 200 with a dashboard:// payload for a DB-only entity (schema)", async () => {
    const [project] = await db
      .insert(projects)
      .values({ name: "Schema Owner", rootPath: "/tmp/schema-owner" })
      .returning();
    const [schema] = await db
      .insert(schemas)
      .values({
        projectId: project.id,
        name: "Reference Test Schema",
        definition: "{}",
      })
      .returning();

    const res = await callReferenceGet("schema", schema.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("schema");
    expect(body.id).toBe(schema.id);
    expect(body.title).toBe("Reference Test Schema");
    expect(body.path).toBe(`dashboard://schema/${schema.id}`);
    expect(body.readInstruction).toContain("dashboard database");
  });
});

describe("GET /api/reference/[type]/[id] — task 6.5 manual verification gate", () => {
  // Codifies the three sub-behaviors of task 6.5's manual smoke test as
  // automated assertions so the gate cannot silently regress:
  //   (a) hit `/api/reference/task/<id>`   -> 200 JSON
  //   (b) hit `/api/reference/unknown/x`   -> 400 taxonomy
  //   (c) hit `/api/reference/task/<bad>`  -> 404
  // The 400 + 404 cases are covered above; this block adds the missing
  // task/<id> -> 200 case end-to-end through the route handler.
  it("returns 200 JSON for a real task with the canonical payload shape", async () => {
    const [project] = await db
      .insert(projects)
      .values({ name: "Task Ref Project", rootPath: "/tmp/task-ref-repo" })
      .returning();
    const [change] = await db
      .insert(changes)
      .values({ projectId: project.id, name: "add-task-ref", status: "proposed" })
      .returning();
    const [taskRow] = await db
      .insert(tasks)
      .values({
        changeId: change.id,
        projectId: project.id,
        taskNumber: "6.5",
        title: "Verify reference API",
        status: "in-progress",
        assignee: "alice",
        priority: "high",
      })
      .returning();

    const res = await callReferenceGet("task", taskRow.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.type).toBe("task");
    expect(body.id).toBe(taskRow.id);
    expect(body.title).toBe("Verify reference API");
    // Task path resolves into the change's tasks.md under the project rootPath
    expect(body.path).toBe("/tmp/task-ref-repo/openspec/changes/add-task-ref/tasks.md");
    expect(typeof body.readInstruction).toBe("string");
    expect(body.readInstruction.length).toBeGreaterThan(0);
    // Per-kind metadata carries the task scalars, no nulls
    expect(body.metadata).toEqual(
      expect.objectContaining({
        taskNumber: "6.5",
        status: "in-progress",
        assignee: "alice",
        priority: "high",
        changeName: "add-task-ref",
        projectName: "Task Ref Project",
      }),
    );
    expect(Object.values(body.metadata)).not.toContain(null);
    expect(body.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    );
  });
});

describe("GET /api/reference/[type]/[id] — 404 missing entity (task 2.2)", () => {
  it("returns 404 with a JSON error body identifying the missing task entity", async () => {
    const missingId = "00000000-0000-0000-0000-000000000000";
    const res = await callReferenceGet("task", missingId);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    // Body identifies the missing entity by type + id
    expect(body.error).toMatch(/task/i);
    expect(body.error).toMatch(/not found/i);
    expect(body.id).toBe(missingId);
  });

  it("returns 404 for a missing project entity (consistent across kinds)", async () => {
    const missingId = "11111111-1111-1111-1111-111111111111";
    const res = await callReferenceGet("project", missingId);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/project/i);
    expect(body.error).toMatch(/not found/i);
    expect(body.id).toBe(missingId);
  });

  it("does not leak internal filesystem/repository paths in the 404 error body", async () => {
    const res = await callReferenceGet("task", "does-not-exist-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    // No absolute filesystem paths, repo-relative source paths, or stack frames
    expect(serialized).not.toContain("/home/");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("openspec-dashboard/src/");
    expect(serialized).not.toContain("node_modules");
    expect(serialized).not.toMatch(/\bat \w+\.ts:\d+/);
    expect(serialized).not.toContain("\\\\"); // no windows drive paths
  });
});
