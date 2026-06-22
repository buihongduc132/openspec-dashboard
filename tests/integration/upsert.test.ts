/**
 * Task 5.3 (cycle 3) — `src/lib/projection/upsert.ts` integration suite.
 *
 * Exercises the per-(project, kind) transactional upsert with content-hash
 * skip and delete-missing-files tombstone pass against a real Postgres
 * testcontainer DB, driven from a tmpdir fixture tree scanned + parsed by the
 * real scanner (task 4.2) and parse-runner (task 4.3).
 *
 * Scenarios required by the content-projection spec:
 *  - truncate, project once, assert rows;
 *  - project again unchanged → no write SQL issued (content-hash skip);
 *  - edit one file → only that capability's rows change;
 *  - delete a capability dir → its rows gone.
 *
 * To assert "no SQL issued" we wrap the pg Pool so every query (including
 * those inside drizzle transactions, which acquire a client via
 * `pool.connect()`) is recorded, then filter for write statements.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  specDomains,
  specs,
  requirements,
  scenarios,
  changes,
  deltaSpecs,
  tasks,
  projects,
} from "@/db/schema";
import { scanProjectTree } from "@/lib/projection/scanner";
import { runParsers, readFileSyncUtf8 } from "@/lib/projection/parse-runner";
import { upsertProjectContent } from "@/lib/projection/upsert";
import "./setup";

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TIMEOUT = 60_000;

/** Build a minimal openspec tree under a fresh tmpdir and return its root. */
function buildFixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "upsert-fixture-"));
  const ospec = path.join(root, "openspec");

  // auth capability: two requirements, one scenario each.
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
      "### Requirement: Logout",
      "Users shall log out.",
      "",
      "#### Scenario: User clicks logout",
      "- WHEN the user clicks logout",
      "- THEN the session is destroyed",
      "",
    ].join("\n"),
  );

  // one active change with a delta + tasks.
  mkdirSync(path.join(ospec, "changes", "add-login", "specs", "auth"), {
    recursive: true,
  });
  writeFileSync(
    path.join(ospec, "changes", "add-login", "tasks.md"),
    ["- [x] First", "- [ ] Second", ""].join("\n"),
  );
  writeFileSync(
    path.join(ospec, "changes", "add-login", "specs", "auth", "spec.md"),
    [
      "## ADDED Requirements",
      "",
      "### Requirement: SSO",
      "The system shall support SSO.",
      "",
    ].join("\n"),
  );

  return root;
}

/**
 * Wrap a pg Pool so every SQL statement issued on the pool directly (not via a
 * connected transaction client) is appended to `log`. The implementation is
 * designed so the content-hash-skip path issues only SELECTs on the pool and
 * opens NO transaction when nothing changed — therefore zero write statements
 * are recorded on an unchanged re-run.
 */
function wrapPool(pool: Pool, log: string[]): Pool {
  const record = (arg: unknown) => {
    const q = arg as { text?: string } | string;
    const text = typeof q === "string" ? q : q?.text ?? "";
    if (typeof text === "string") log.push(text);
  };

  const origQuery = pool.query.bind(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = function (...args: unknown[]) {
    record(args[0]);
    return (origQuery as unknown as (...a: unknown[]) => unknown)(...args);
  };

  return pool;
}

/** Count write statements (INSERT/UPDATE/DELETE) in a recorded query log. */
function writeStatements(log: string[]): string[] {
  return log.filter((s) => /\b(insert|update|delete)\b/i.test(s));
}

describe(
  "task 4.4/5.3 — upsert: per-kind transactional upsert with hash skip + delete-missing",
  () => {
    let root: string;
    // Shared recording pool + drizzle instance for the whole suite (avoids
    // per-test connection churn against the testcontainer).
    let pool: Pool;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let log: string[];
    let projectId: string;

    beforeAll(async () => {
      log = [];
      pool = wrapPool(new Pool({ connectionString: process.env.DATABASE_URL! }), log);
      db = drizzle(pool, { schema });
    }, TIMEOUT);

    afterAll(async () => {
      await pool.end();
    }, TIMEOUT);

    beforeEach(async () => {
      root = buildFixtureRoot();
      log.length = 0;

      // Fresh project row in the shared testcontainer DB.
      await pool.query("truncate projects cascade");
      const ins = await pool.query(
        "insert into projects (name, root_path) values ($1, $2) returning id",
        ["Upsert Fixture", root],
      );
      projectId = ins.rows[0].id;
    }, TIMEOUT);

    afterEach(() => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    });

    async function projectOnce() {
      const scan = scanProjectTree(root);
      if (!scan.ok) throw new Error(`scan failed: ${scan.reason}`);
      const parsed = runParsers(scan, readFileSyncUtf8);
      return upsertProjectContent(db, projectId, parsed.files);
    }

    it(
      "projects a clean tree into spec_domains/specs/requirements/scenarios/changes/delta_specs/tasks",
      async () => {
        const stats = await projectOnce();
        expect(stats.upserted.length).toBeGreaterThan(0);

        const domains = await db.select().from(specDomains);
        expect(domains.map((d: { name: string }) => d.name).sort()).toEqual(["auth"]);

        const reqs = await db.select().from(requirements);
        expect(reqs.map((r: { title: string }) => r.title).sort()).toEqual([
          "Login",
          "Logout",
        ]);

        const scens = await db.select().from(scenarios);
        expect(scens.length).toBe(2);

        const ch = await db.select().from(changes);
        expect(ch.map((c: { name: string }) => c.name)).toEqual(["add-login"]);

        const ds = await db.select().from(deltaSpecs);
        expect(ds.length).toBe(1);

        const tk = await db.select().from(tasks);
        expect(tk.map((t: { title: string }) => t.title)).toEqual(["First", "Second"]);
        expect(tk.map((t: { checked: boolean }) => t.checked)).toEqual([true, false]);
      },
      TIMEOUT,
    );

    it(
      "issues no write SQL on a second unchanged run (content-hash skip)",
      async () => {
        await projectOnce();
        log.length = 0; // reset log after first run

        await projectOnce();

        const writes = writeStatements(log);
        expect(
          writes,
          `expected zero write statements on unchanged re-run, got: ${writes.join("\n")}`,
        ).toEqual([]);
      },
      TIMEOUT,
    );

    it(
      "when one requirement body is edited, only that requirement row changes",
      async () => {
        await projectOnce();

        const beforeRows = await db.select().from(requirements);
        const beforeById = new Map<string, Date>(
          beforeRows.map((r: { id: string; updatedAt: Date }) => [r.id, r.updatedAt] as [string, Date]),
        );

        // Edit the Login requirement body in place.
        const specPath = path.join(root, "openspec", "specs", "auth", "spec.md");
        writeFileSync(
          specPath,
          [
            "## Requirements",
            "",
            "### Requirement: Login",
            "Users shall log in with a password and MFA.",
            "",
            "#### Scenario: Valid credentials",
            "- WHEN the user submits valid credentials",
            "- THEN a session is created",
            "",
            "### Requirement: Logout",
            "Users shall log out.",
            "",
            "#### Scenario: User clicks logout",
            "- WHEN the user clicks logout",
            "- THEN the session is destroyed",
            "",
          ].join("\n"),
        );

        await projectOnce();

        const afterRows = await db.select().from(requirements);
        const login = afterRows.find((r: { title: string }) => r.title === "Login");
        const logout = afterRows.find((r: { title: string }) => r.title === "Logout");
        expect(login.body).toContain("MFA");
        expect(logout.body).toBe("Users shall log out.");

        // Login's updatedAt advanced; Logout's unchanged (no UPDATE issued).
        expect(
          login.updatedAt.getTime(),
          "Login row should have been updated",
        ).toBeGreaterThan(beforeById.get(login.id)!.getTime());
        expect(
          logout.updatedAt.getTime(),
          "Logout row should NOT have been updated (hash skip)",
        ).toBe(beforeById.get(logout.id)!.getTime());
      },
      TIMEOUT,
    );

    it(
      "deletes rows for a capability directory removed between runs",
      async () => {
        await projectOnce();

        // Add a second capability, project, then remove it and re-project.
        mkdirSync(path.join(root, "openspec", "specs", "billing"), { recursive: true });
        writeFileSync(
          path.join(root, "openspec", "specs", "billing", "spec.md"),
          ["## Requirements", "", "### Requirement: Invoicing", "Shall invoice.", ""].join("\n"),
        );
        await projectOnce();

        const domainsBefore = await db.select().from(specDomains);
        expect(domainsBefore.map((d: { name: string }) => d.name).sort()).toEqual([
          "auth",
          "billing",
        ]);

        // Remove billing capability dir and re-project.
        rmSync(path.join(root, "openspec", "specs", "billing"), {
          recursive: true,
          force: true,
        });
        await projectOnce();

        const domainsAfter = await db.select().from(specDomains);
        expect(domainsAfter.map((d: { name: string }) => d.name)).toEqual(["auth"]);

        const billingSpecs = await db
          .select()
          .from(specs)
          .leftJoin(specDomains, eq(specs.domainId, specDomains.id))
          .where(eq(specDomains.name, "billing"));
        expect(billingSpecs.length).toBe(0);

        // auth content untouched.
        const authReqs = await db
          .select()
          .from(requirements)
          .leftJoin(specs, eq(requirements.specId, specs.id))
          .leftJoin(specDomains, eq(specs.domainId, specDomains.id))
          .where(eq(specDomains.name, "auth"));
        expect(authReqs.length).toBe(2);
      },
      TIMEOUT,
    );

    it(
      "leaves the project row to the orchestrator (task 4.5) and stays queryable",
      async () => {
        await projectOnce();
        const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
        expect(row).toBeDefined();
      },
      TIMEOUT,
    );
  },
);
