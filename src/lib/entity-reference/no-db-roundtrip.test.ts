import { describe, it, expect, vi } from "vitest";

/**
 * Task 4.6 — Ensure server pages pass already-fetched rows (no extra DB
 * round-trips) into the client button as serialized `EntityReference`.
 *
 * The architectural guarantee behind 4.6 is two-fold:
 *
 *  1. `buildEntityReference` (the single canonical builder, design D1) MUST be
 *     a pure function of (type, row, ctx). It must NOT import or call anything
 *     in `@/db`; otherwise every page that renders a Copy reference control
 *     would incur an extra DB round-trip purely to populate the payload.
 *
 *  2. Consequently, every server page can build references inline from rows it
 *     has already fetched for its own rendering, with zero added queries.
 *
 * This test pins guarantee (1) directly: we replace `@/db` with a hard-throwing
 * stub and assert `buildEntityReference` succeeds for every supported kind. If
 * a future change makes the builder reach into the database, this test fails
 * the moment that DB touch happens.
 */

// Replace @/db with a sentinel that throws on ANY access. If the builder (or
// any transitive import it pulls in) ever reaches for the database, the call
// throws `DB_TOUCHED` and the test fails loudly.
vi.mock("@/db", () => {
  const trap = new Proxy(
    {},
    {
      get() {
        throw new Error("DB_TOUCHED: builder reached into @/db");
      },
      apply() {
        throw new Error("DB_TOUCHED: builder invoked @/db");
      },
    },
  );
  return { db: trap, default: trap };
});

import { buildEntityReference } from "@/lib/entity-reference/build";
import type { BuildRow } from "@/lib/entity-reference/build";
import type { EntityType, ReferenceContext } from "@/lib/entity-reference/types";

const baseCtx: ReferenceContext = {
  repoRoot: "/repos/demo",
  projectRootPath: "/repos/demo",
  projectName: "Demo",
  changeName: "add-auth",
  domainName: "auth",
};

// One minimal row per supported kind, each carrying only the fields the
// builder reads. Built once and reused across kinds.
const sampleRows: Record<EntityType, BuildRow> = {
  project: { id: "p1", name: "Demo", rootPath: "/repos/demo" },
  change: { id: "c1", name: "add-auth" },
  task: { id: "t1", taskNumber: "1", title: "Do it" },
  "spec-domain": { id: "d1", name: "auth" },
  requirement: { id: "r1", title: "Authn" },
  spec: { id: "s1", name: "spec.md" },
  schema: { id: "sc1", name: "default" },
  "context-store": { id: "cs1", name: "store", path: "/ctx" },
  workspace: { id: "w1", name: "ws" },
  initiative: { id: "i1", title: "Init" },
};

const kinds = Object.keys(sampleRows) as EntityType[];

describe("Task 4.6 — building an EntityReference never touches the database", () => {
  it("builds a reference for every supported kind without invoking @/db", () => {
    for (const kind of kinds) {
      // If the builder reaches into @/db for any kind, the @/db trap throws
      // `DB_TOUCHED` and this iteration fails with a clear message.
      const ref = buildEntityReference(kind, sampleRows[kind], baseCtx);
      expect(ref.type).toBe(kind);
      expect(ref.id).toBe(sampleRows[kind].id);
    }
  });

  it("produces a JSON-serializable EntityReference (server → client boundary)", () => {
    // "serialized EntityReference" (task 4.6) implies the payload must survive
    // JSON.stringify across the RSC wire. Verify it round-trips cleanly.
    for (const kind of kinds) {
      const ref = buildEntityReference(kind, sampleRows[kind], baseCtx);
      const json = JSON.parse(JSON.stringify(ref));
      expect(json.type).toBe(kind);
      expect(json.metadata).toBeTypeOf("object");
    }
  });
});
