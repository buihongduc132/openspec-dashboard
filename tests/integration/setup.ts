/**
 * Integration test setup helpers.
 *
 * The Postgres testcontainer is started by global-setup.ts (vitest globalSetup),
 * which also sets process.env.DATABASE_URL before any test file imports.
 * This file provides convenience helpers for accessing the test DB.
 *
 * Import this file in integration test files for the getDb() helper:
 *   import "./setup";
 *   import { GET } from "@/app/api/health/route";
 */
import { db } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";

export type SchemaDb = NodePgDatabase<typeof schema>;

/**
 * Get the Drizzle instance backed by the testcontainer DB.
 * DATABASE_URL is set by global-setup.ts before this module is imported.
 */
export function getDb(): SchemaDb {
  return db as unknown as SchemaDb;
}

/** Get the connection string for the testcontainer. */
export function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set — global-setup.ts has not run");
  return url;
}
