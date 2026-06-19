/**
 * Vitest globalSetup for integration tests.
 *
 * Runs ONCE before any test file is loaded. This fixes the DB initialization
 * race condition: src/db/index.ts reads process.env.DATABASE_URL eagerly at
 * module-evaluation time. If DATABASE_URL is only set in a beforeAll hook
 * (post-import), the pool either throws (URL undefined) or connects to the
 * wrong database.
 *
 * By setting DATABASE_URL here, before any imports, we ensure the pool in
 * src/db/index.ts connects to the testcontainer.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";

let container: StartedPostgreSqlContainer | undefined;

export default async function globalSetup() {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("testdb")
    .withUsername("test")
    .withPassword("test")
    .start();

  const connectionString = container.getConnectionUri();

  // Set DATABASE_URL BEFORE any test file imports src/db/index.ts
  process.env.DATABASE_URL = connectionString;

  // Run Drizzle migrations against the testcontainer (if they exist)
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const fs = await import("node:fs");
  if (fs.existsSync(migrationsFolder)) {
    try {
      await migrate(db, { migrationsFolder });
      console.log("[global-setup] Drizzle migrations applied");
    } catch (error) {
      console.error("[global-setup] Failed to run Drizzle migrations:", error);
      await pool.end();
      throw error;
    }
  } else {
    console.warn("[global-setup] No drizzle/ migrations folder found — skipping (smoke tests only need raw DB access)");
  }
  await pool.end();

  console.log("[global-setup] Postgres testcontainer ready:", connectionString);

  // Teardown — called after all tests complete
  return async () => {
    if (container) {
      await container.stop();
      console.log("[global-setup] Postgres testcontainer stopped");
    }
  };
}
