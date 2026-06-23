/**
 * CI-only minimal seed for the Postgres-backed perf/NFR gates.
 *
 * Why a separate file: src/db/seed.ts uses extensionless TS imports
 * (`./index`, `./schema`) that Node's --experimental-strip-types loader
 * cannot resolve without an explicit `.ts` extension. Replicating the full
 * seed here would drift from seed.ts; instead we insert only the rows the
 * perf gates actually need:
 *   - k6 (NFR-2) reads  GET /api/projects/0205878f-...  -> needs that row.
 *   - Lighthouse (NFR-1) renders / and /projects          -> needs schema only.
 *
 * Uses the `pg` driver (already a runtime dependency) so no new tooling is
 * introduced. The deterministic id 0205878f-2223-59d2-aaa4-4993775e92c4
 * (uuid5 of "seed-project-1") matches K6_PROJECT_ID / FRESHNESS_PROJECT_ID
 * in ci.yml and the seeded id in src/db/seed.ts (projects.id is uuid-typed).
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ci-seed: DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

try {
  await pool.query(`
    INSERT INTO projects (id, name, description, root_path, default_schema, enrollment_source, projected)
    VALUES ('0205878f-2223-59d2-aaa4-4993775e92c4', 'E-Commerce Platform', 'CI perf-seed project (k6/Lighthouse target)', '/repos/ecommerce-platform', 'spec-driven', 'local', true)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("ci-seed: inserted 0205878f-2223-59d2-aaa4-4993775e92c4 (seed-project-1)");
} finally {
  await pool.end();
}
