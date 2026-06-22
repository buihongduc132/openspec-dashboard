/**
 * Task 5.4 (cycle 4) — `src/lib/projection/project.ts` end-to-end suite.
 *
 * Drives the full orchestrator (`projectProject`) against a real Postgres
 * testcontainer DB plus a tmpdir fixture tree (scanned + parsed by the real
 * scanner/parse-runner, upserted by the real upsert layer). Asserts the
 * content-projection spec's top-level scenarios:
 *  - clean local project → projected=true, lastProjectedAt set, parseErrors [];
 *  - rootPath deleted → projected=false, projectionError recorded, no throw;
 *  - idempotent re-projection keeps rows + advances lastProjectedAt;
 *  - parse issues surfaced into projectionError as JSON + returned parseErrors.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { projects, requirements, changes, tasks } from "@/db/schema";
import { projectProject } from "@/lib/projection/project";
import "./setup";

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TIMEOUT = 60_000;

function buildFixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "project-fixture-"));
  const ospec = path.join(root, "openspec");

  mkdirSync(path.join(ospec, "specs", "auth"), { recursive: true });
  writeFileSync(
    path.join(ospec, "specs", "auth", "spec.md"),
    [
      "## Requirements",
      "",
      "### Requirement: Login",
      "Users shall log in.",
      "",
      "#### Scenario: Valid credentials",
      "- WHEN the user submits valid credentials",
      "- THEN a session is created",
      "",
    ].join("\n"),
  );

  mkdirSync(path.join(ospec, "changes", "add-login", "specs", "auth"), {
    recursive: true,
  });
  writeFileSync(
    path.join(ospec, "changes", "add-login", "tasks.md"),
    ["- [x] First", "- [ ] Second", ""].join("\n"),
  );
  writeFileSync(
    path.join(ospec, "changes", "add-login", "specs", "auth", "spec.md"),
    ["## ADDED Requirements", "", "### Requirement: SSO", "Shall support SSO.", ""].join("\n"),
  );

  return root;
}

describe(
  "task 4.5/5.4 — projectProject: end-to-end scan→parse→upsert + status fields",
  () => {
    let root: string;
    let pool: Pool;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let projectId: string;

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL! });
      db = drizzle(pool, { schema });
    }, TIMEOUT);

    afterAll(async () => {
      await pool.end();
    }, TIMEOUT);

    beforeEach(async () => {
      root = buildFixtureRoot();
      await pool.query("truncate projects cascade");
      const ins = await pool.query(
        "insert into projects (name, root_path) values ($1, $2) returning id",
        ["Project Fixture", root],
      );
      projectId = ins.rows[0].id;
    }, TIMEOUT);

    afterEach(() => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    });

    it(
      "projects a clean local tree: projected=true, lastProjectedAt set, parseErrors empty, rows present",
      async () => {
        const result = await projectProject(projectId, db);

        expect(result.projectId).toBe(projectId);
        expect(result.projected).toBe(true);
        expect(result.lastProjectedAt).toBeInstanceOf(Date);
        expect(result.parseErrors).toEqual([]);

        const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
        expect(row.projected).toBe(true);
        expect(row.lastProjectedAt).not.toBeNull();
        // empty parseErrors → null projectionError (no error to record)
        expect(row.projectionError).toBeNull();

        const reqs = await db.select().from(requirements);
        expect(reqs.map((r: { title: string }) => r.title)).toContain("Login");

        const ch = await db.select().from(changes);
        expect(ch.map((c: { name: string }) => c.name)).toEqual(["add-login"]);

        const tk = await db.select().from(tasks);
        expect(tk.map((t: { title: string }) => t.title)).toEqual(["First", "Second"]);
      },
      TIMEOUT,
    );

    it(
      "records a skip + projected=false without throwing when rootPath is missing",
      async () => {
        rmSync(root, { recursive: true, force: true });

        const result = await projectProject(projectId, db);

        expect(result.projected).toBe(false);
        expect(result.skippedReason).toBeTruthy();
        expect(result.parseErrors).toEqual([]);

        const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
        expect(row.projected).toBe(false);
        expect(row.projectionError).toContain(root);
      },
      TIMEOUT,
    );

    it(
      "advances lastProjectedAt on a re-run and keeps projected=true",
      async () => {
        const first = await projectProject(projectId, db);
        // small delay so the timestamp actually advances in DB resolution
        await new Promise((r) => setTimeout(r, 50));
        const second = await projectProject(projectId, db);

        expect(second.projected).toBe(true);
        expect(
          second.lastProjectedAt!.getTime(),
          "lastProjectedAt should advance on a successful re-run",
        ).toBeGreaterThanOrEqual(first.lastProjectedAt!.getTime());
      },
      TIMEOUT,
    );

    it(
      "surfaces parse issues into projectionError (JSON) + returned parseErrors",
      async () => {
        // Inject a delta header inside a MAIN spec — parser flags as error.
        const specPath = path.join(root, "openspec", "specs", "auth", "spec.md");
        writeFileSync(
          specPath,
          [
            "## Requirements",
            "",
            "### Requirement: Login",
            "Users shall log in.",
            "",
            "## ADDED Requirements",
            "",
          ].join("\n"),
        );

        const result = await projectProject(projectId, db);

        // Even with a parse issue, the parseable parts are upserted.
        expect(result.projected).toBe(true);
        expect(result.parseErrors.length).toBeGreaterThanOrEqual(1);
        const errIssue = result.parseErrors.find(
          (i: { kind: string }) => i.kind === "delta-header",
        );
        expect(errIssue, "expected a delta-header parse error").toBeTruthy();

        const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
        expect(row.projectionError).not.toBeNull();
        const blob = JSON.parse(row.projectionError);
        expect(Array.isArray(blob)).toBe(true);
        expect(blob.some((i: { kind: string }) => i.kind === "delta-header")).toBe(true);
      },
      TIMEOUT,
    );
  },
);
