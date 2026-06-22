/**
 * Task 1.3 (cycle 1) — lastProjectedAt + projectionError on projects.
 *
 * Projection-status (D2 / projection-status spec) requires two columns on
 * `projects`: `lastProjectedAt` (timestamp, nullable) advanced on every
 * successful run, and `projectionError` (text, nullable) recording a human
 * reason when a run fails (e.g. missing rootPath). Both are nullable so
 * legacy rows report "never projected".
 *
 * Verified against the testcontainer DB (migrated from drizzle/).
 */
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import "./setup";
import { db } from "@/db";
import { projects } from "@/db/schema";

type ColumnRow = {
  column_name: string;
  is_nullable: "YES" | "NO";
  data_type: string;
  column_default: string | null;
};

async function projectsColumns(): Promise<ColumnRow[]> {
  const rows = await db.execute(sql`
    select column_name, is_nullable, data_type, column_default
    from information_schema.columns
    where table_name = ${"projects"} and table_schema = ${"public"}
    order by column_name
  `);
  return rows.rows as ColumnRow[];
}

describe("task 1.3 — lastProjectedAt + projectionError on projects", () => {
  it("Drizzle schema declares projects.lastProjectedAt and projects.projectionError", () => {
    expect(projects.lastProjectedAt, "projects.lastProjectedAt must be declared in schema.ts").toBeDefined();
    expect(projects.projectionError, "projects.projectionError must be declared in schema.ts").toBeDefined();
  });

  it("projects has nullable last_projected_at timestamp", async () => {
    const cols = await projectsColumns();
    const col = cols.find((c) => c.column_name === "last_projected_at");
    expect(col, "last_projected_at column must exist").toBeDefined();
    expect(col!.is_nullable).toBe("YES");
    expect(col!.data_type).toBe("timestamp without time zone");
    expect(col!.column_default).toBeNull();
  });

  it("projects has nullable projection_error text", async () => {
    const cols = await projectsColumns();
    const col = cols.find((c) => c.column_name === "projection_error");
    expect(col, "projection_error column must exist").toBeDefined();
    expect(col!.is_nullable).toBe("YES");
    expect(col!.data_type).toBe("text");
    expect(col!.column_default).toBeNull();
  });

  it("re-seeds: a project insert omitting the new columns leaves them null", async () => {
    const result = await db.execute(sql`
      insert into projects (name, root_path)
      values ('Projection Seed Probe', '/tmp/projection-seed-probe')
      returning last_projected_at, projection_error
    `);
    const row = (result.rows as unknown as Array<Record<string, unknown>>)[0];
    expect(row.last_projected_at).toBeNull();
    expect(row.projection_error).toBeNull();
  });
});
