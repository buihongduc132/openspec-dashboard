/**
 * Task 1.2 (cycle 1) — contentHash column on content tables.
 *
 * The incremental projection (D2) skips unchanged rows by comparing a
 * SHA-256 content hash. Every content-bearing table must carry a nullable
 * `contentHash` column so existing rows (hash = null) are treated as
 * "always re-parse" and new rows store their canonicalized hash.
 *
 * Verified against the testcontainer DB (migrated from drizzle/).
 */
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import "./setup";
import { db } from "@/db";

type ColumnRow = { table_name: string; column_name: string; is_nullable: "YES" | "NO" };

async function contentHashColumns(): Promise<ColumnRow[]> {
  const rows = await db.execute(sql`
    select table_name, column_name, is_nullable
    from information_schema.columns
    where column_name = ${"content_hash"}
    and table_schema = ${"public"}
    order by table_name
  `);
  return rows.rows as ColumnRow[];
}

describe("task 1.2 — contentHash column on content tables", () => {
  it("specs, requirements, scenarios, changes, artifacts, delta_specs, tasks all have nullable content_hash", async () => {
    const expected = [
      "specs",
      "requirements",
      "scenarios",
      "changes",
      "artifacts",
      "delta_specs",
      "tasks",
    ];
    const cols = await contentHashColumns();
    const got = cols.map((c) => c.table_name).sort();
    expect(got).toEqual([...expected].sort());
    // All must be nullable so legacy rows (hash=null) re-parse once.
    for (const c of cols) {
      expect(c.is_nullable).toBe("YES");
    }
  });
});
