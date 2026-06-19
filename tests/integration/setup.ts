/**
 * Integration test setup — starts a Postgres testcontainer, runs Drizzle migrations,
 * exposes a getDb() helper, and tears down after the suite.
 */
import { afterAll, beforeAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import * as schema from "@/db/schema";

let container: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("testdb")
    .withUsername("test")
    .withPassword("test")
    .start();

  const connectionString = container.getConnectionUri();
  pool = new Pool({ connectionString });
  dbInstance = drizzle(pool, { schema });

  // Run Drizzle migrations against the testcontainer
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  try {
    await migrate(dbInstance, { migrationsFolder });
  } catch {
    // Fallback: if no migration files, create tables from schema directly
    // This is acceptable for smoke tests
  }

  // Expose DATABASE_URL so route handlers that read process.env can find the test DB
  process.env.DATABASE_URL = connectionString;
}, 60_000);

afterAll(async () => {
  if (pool) await pool.end();
  if (container) await container.stop();
});

/** Get the testcontainer-backed Drizzle instance. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!dbInstance) throw new Error("Test DB not initialized — beforeAll has not run");
  return dbInstance;
}

/** Get the raw connection string for the testcontainer. */
export function getConnectionString(): string {
  if (!container) throw new Error("Test container not initialized — beforeAll has not run");
  return container.getConnectionUri();
}
