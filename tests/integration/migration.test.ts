/**
 * Task 1.3 — Drizzle migration exists and is additive / non-breaking.
 *
 * The collective-dashboard change adds three columns to `projects`
 * (enrollment_source, remote_git_url, projected) at the Drizzle-schema level
 * (tasks 1.1 / 1.2). Task 1.3 generates the Drizzle migration that realizes
 * those columns in the database, so the testcontainer harness (which runs
 * `drizzle-orm/node-postgres/migrator` against the `drizzle/` folder in
 * global-setup) provisions them automatically.
 *
 * This test verifies the migration contract end-to-end against the
 * testcontainer DB:
 *   - the migration folder exists on disk (so global-setup applies it),
 *   - after migration the `projects` table exposes the three new columns with
 *     the correct defaults and nullability (additive — existing flows that
 *     omit these columns still work via DB defaults).
 *
 * Before task 1.3 there is no `drizzle/` folder, global-setup skips
 * migration, the testcontainer DB has no `projects` table, and this test
 * FAILS — the intended RED state.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import "./setup";
import { db } from "@/db";

type ColumnRow = {
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

async function projectsColumns(): Promise<ColumnRow[]> {
  const rows = await db.execute(sql`
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_name = ${"projects"}
    order by column_name
  `);
  return rows.rows as ColumnRow[];
}

describe("task 1.3 — Drizzle migration (additive enrollment columns)", () => {
  it("ships a drizzle/ migration folder so global-setup applies it", () => {
    const dir = path.resolve(process.cwd(), "drizzle");
    expect(
      fs.existsSync(dir),
      "drizzle/ migrations folder must exist",
    ).toBe(true);
    const sqlFiles = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"));
    expect(
      sqlFiles.length,
      "drizzle/ must contain at least one .sql migration",
    ).toBeGreaterThan(0);
  });

  it("projects table has enrollment_source defaulting to 'local', not null", async () => {
    const cols = await projectsColumns();
    const col = cols.find((c) => c.column_name === "enrollment_source");
    expect(col, "enrollment_source column must exist").toBeDefined();
    expect(col!.is_nullable).toBe("NO");
    expect(col!.column_default).toBe("'local'::character varying");
  });

  it("projects table has remote_git_url as a nullable column", async () => {
    const cols = await projectsColumns();
    const col = cols.find((c) => c.column_name === "remote_git_url");
    expect(col, "remote_git_url column must exist").toBeDefined();
    expect(col!.is_nullable).toBe("YES");
    expect(col!.column_default).toBeNull();
  });

  it("projects table has projected defaulting to false, not null", async () => {
    const cols = await projectsColumns();
    const col = cols.find((c) => c.column_name === "projected");
    expect(col, "projected column must exist").toBeDefined();
    expect(col!.is_nullable).toBe("NO");
    expect(col!.column_default).toBe("false");
  });

  it("re-seeds defaults: a project insert omitting the new columns succeeds", async () => {
    // Mirrors seed.ts which inserts projects without setting the enrollment
    // columns — they must be supplied by DB defaults (additive, non-breaking).
    const result = await db.execute(sql`
      insert into projects (name, root_path)
      values ('Migration Seed Probe', '/tmp/migration-seed-probe')
      returning enrollment_source, remote_git_url, projected
    `);
    const row = (result.rows as unknown as Array<Record<string, unknown>>)[0];
    expect(row.enrollment_source).toBe("local");
    expect(row.remote_git_url).toBeNull();
    expect(row.projected).toBe(false);
  });
});
