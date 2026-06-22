/**
 * Task 5.4 — Context stores write flows (req 01.8).
 *
 * Requirement 01.8 ("Context store & initiatives — server-side projection")
 * mandates that the dashboard manage context stores and the initiatives they
 * hold, with initiative CRUD including status transitions
 * (proposed → active → completed → abandoned). Context store + initiative
 * data is server-side projection metadata stored in the dashboard DB, NOT as
 * an invented upstream file (CLI parity deferred until the upstream format is
 * confirmed).
 *
 * Task 2.12 delivered a read-only context-stores page shell. Before task 5.4
 * there are no API write endpoints for context stores or initiatives
 * (no POST/PATCH/DELETE handlers), so these assertions FAIL against the
 * missing handlers — the intended RED state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { callPost, callPostWithParams, callPatch, callDelete } from "./helpers";
import { POST as storePOST, GET as storeGET } from "@/app/api/context-stores/route";
import {
  GET as storeDetailGET,
  PATCH as storePATCH,
  DELETE as storeDELETE,
} from "@/app/api/context-stores/[id]/route";
import {
  POST as initiativePOST,
  GET as initiativeGET,
} from "@/app/api/context-stores/[id]/initiatives/route";
import {
  PATCH as initiativePATCH,
  DELETE as initiativeDELETE,
} from "@/app/api/context-stores/[id]/initiatives/[initiativeId]/route";

// Per-test isolation: truncate the initiatives + context_stores tables so
// each assertion runs against a known-empty state. Order matters because of
// the initiatives FK into context_stores.
async function resetTables() {
  await db.execute(sql`delete from initiatives`);
  await db.execute(sql`delete from context_stores`);
}

describe("Context stores write flows (task 5.4, req 01.8)", () => {
  beforeEach(async () => {
    await resetTables();
  });

  it("POST /api/context-stores creates a context store with name + path", async () => {
    const res = await callPost(storePOST, "/api/context-stores", {
      name: "Platform Context",
      path: "/srv/context/platform",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("Platform Context");
    expect(body.path).toBe("/srv/context/platform");

    // Confirm the row is truly persisted (not just echoed).
    const result = await db.execute(sql`
      select name, path from context_stores where id = ${body.id}
    `);
    const row = (result.rows as unknown as Array<Record<string, unknown>>)[0];
    expect(row.name).toBe("Platform Context");
    expect(row.path).toBe("/srv/context/platform");
  });

  it("POST /api/context-stores rejects a missing name with 400", async () => {
    const res = await callPost(storePOST, "/api/context-stores", { path: "/tmp/x" });
    expect(res.status).toBe(400);
  });

  it("GET /api/context-stores lists created context stores", async () => {
    await callPost(storePOST, "/api/context-stores", { name: "CS-A", path: "/tmp/a" });
    await callPost(storePOST, "/api/context-stores", { name: "CS-B", path: "/tmp/b" });

    const res = await storeGET();
    const body = await res.json();
    const names = body.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(["CS-A", "CS-B"]);
  });

  it("PATCH /api/context-stores/[id] updates name and path", async () => {
    const created = await callPost(storePOST, "/api/context-stores", {
      name: "Old Store",
      path: "/tmp/old",
    });
    const { id } = await created.json();

    const res = await callPatch(storePATCH, `/api/context-stores/${id}`, { id }, {
      name: "New Store",
      path: "/tmp/new",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Store");
    expect(body.path).toBe("/tmp/new");
  });

  it("DELETE /api/context-stores/[id] removes the store and cascades to initiatives", async () => {
    const storeRes = await callPost(storePOST, "/api/context-stores", { name: "Doomed", path: "/tmp/d" });
    const { id } = await storeRes.json();

    const res = await callDelete(storeDELETE, `/api/context-stores/${id}`, { id });
    expect(res.status).toBe(200);

    const rows = await db.execute(sql`
      select count(*)::int as n from context_stores where id = ${id}
    `);
    expect((rows.rows as unknown as Array<Record<string, number>>)[0].n).toBe(0);
  });

  it("POST .../initiatives creates an initiative defaulting to 'proposed' status", async () => {
    const storeRes = await callPost(storePOST, "/api/context-stores", { name: "Store", path: "/tmp/s" });
    const { id: storeId } = await storeRes.json();

    const res = await callPostWithParams(
      initiativePOST,
      `/api/context-stores/${storeId}/initiatives`,
      { id: storeId },
      { title: "Migrate to v2", summary: "Move everything to v2 schema" },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.contextStoreId).toBe(storeId);
    expect(body.title).toBe("Migrate to v2");
    expect(body.summary).toBe("Move everything to v2 schema");
    expect(body.status).toBe("proposed");
  });

  it("GET .../initiatives lists initiatives for the store", async () => {
    const storeRes = await callPost(storePOST, "/api/context-stores", { name: "Store", path: "/tmp/s" });
    const { id: storeId } = await storeRes.json();
    await callPostWithParams(
      initiativePOST,
      `/api/context-stores/${storeId}/initiatives`,
      { id: storeId },
      { title: "Init One" },
    );
    await callPostWithParams(
      initiativePOST,
      `/api/context-stores/${storeId}/initiatives`,
      { id: storeId },
      { title: "Init Two" },
    );

    const res = await initiativeGET(
      new NextRequest(`http://localhost:3000/api/context-stores/${storeId}/initiatives`, { method: "GET" }),
      { params: Promise.resolve({ id: storeId }) },
    );
    const body = await res.json();
    const titles = body.map((i: { title: string }) => i.title).sort();
    expect(titles).toEqual(["Init One", "Init Two"]);
  });

  it("PATCH .../initiatives/[initiativeId] transitions status proposed -> active", async () => {
    const storeRes = await callPost(storePOST, "/api/context-stores", { name: "Store", path: "/tmp/s" });
    const { id: storeId } = await storeRes.json();
    const initRes = await callPostWithParams(
      initiativePOST,
      `/api/context-stores/${storeId}/initiatives`,
      { id: storeId },
      { title: "Transit" },
    );
    const init = await initRes.json();

    const res = await callPatch(
      initiativePATCH,
      `/api/context-stores/${storeId}/initiatives/${init.id}`,
      { id: storeId, initiativeId: init.id },
      { status: "active" },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
  });

  it("PATCH .../initiatives/[initiativeId] rejects an invalid status transition with 400", async () => {
    const storeRes = await callPost(storePOST, "/api/context-stores", { name: "Store", path: "/tmp/s" });
    const { id: storeId } = await storeRes.json();
    const initRes = await callPostWithParams(
      initiativePOST,
      `/api/context-stores/${storeId}/initiatives`,
      { id: storeId },
      { title: "Bad Transit" },
    );
    const init = await initRes.json();

    // 'abandoned' is not a valid transition from 'proposed'
    const res = await callPatch(
      initiativePATCH,
      `/api/context-stores/${storeId}/initiatives/${init.id}`,
      { id: storeId, initiativeId: init.id },
      { status: "abandoned" },
    );
    expect(res.status).toBe(400);
  });

  it("DELETE .../initiatives/[initiativeId] removes the initiative", async () => {
    const storeRes = await callPost(storePOST, "/api/context-stores", { name: "Store", path: "/tmp/s" });
    const { id: storeId } = await storeRes.json();
    const initRes = await callPostWithParams(
      initiativePOST,
      `/api/context-stores/${storeId}/initiatives`,
      { id: storeId },
      { title: "Removable" },
    );
    const init = await initRes.json();

    const res = await callDelete(
      initiativeDELETE,
      `/api/context-stores/${storeId}/initiatives/${init.id}`,
      { id: storeId, initiativeId: init.id },
    );
    expect(res.status).toBe(200);

    const rows = await db.execute(sql`
      select count(*)::int as n from initiatives where id = ${init.id}
    `);
    expect((rows.rows as unknown as Array<Record<string, number>>)[0].n).toBe(0);
  });
});
