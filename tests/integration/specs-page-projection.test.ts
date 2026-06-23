/**
 * Task 9.4 (cycle 5) — `/specs` renders real projected capabilities.
 *
 * The smoke task says: "Visit `/specs` in the browser and confirm real
 * capabilities (e.g. pi-acp-agents → 5 domains) now render instead of
 * seed-only data." The testable behavioral invariant underneath that manual
 * browser check is: after projecting a local project, the exact query that
 * `src/app/specs/page.tsx` runs (specDomains ⋈ projects) returns the real
 * projected capability rows — not seed-only data. This integration test
 * drives `projectProject` against a tmpdir fixture with TWO capabilities and
 * asserts the page query surfaces both projected domains with their project
 * names + rootPaths.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { specDomains, projects } from "@/db/schema";
import { projectProject } from "@/lib/projection/project";
import "./setup";

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TIMEOUT = 60_000;

/** Build a tmpdir openspec tree with two capabilities. */
function buildFixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "specs-page-fixture-"));
  const ospec = path.join(root, "openspec");

  for (const cap of ["auth", "billing"]) {
    mkdirSync(path.join(ospec, "specs", cap), { recursive: true });
    writeFileSync(
      path.join(ospec, "specs", cap, "spec.md"),
      [
        "## Requirements",
        "",
        `### Requirement: ${cap === "auth" ? "Login" : "Invoicing"}`,
        `The ${cap} capability shall work.`,
        "",
        "#### Scenario: Happy path",
        `- WHEN a request arrives`,
        `- THEN it succeeds`,
        "",
      ].join("\n"),
    );
  }

  return root;
}

describe("task 9.4 — /specs page query returns real projected capabilities", () => {
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
      ["Real Fixture Project", root],
    );
    projectId = ins.rows[0].id;
  }, TIMEOUT);

  afterEach(() => {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it(
    "the /specs page query surfaces projected capabilities (not seed-only)",
    async () => {
      // Before projection, no spec domains exist for this project.
      const before = await db
        .select({ id: specDomains.id, name: specDomains.name })
        .from(specDomains)
        .innerJoin(projects, eq(specDomains.projectId, projects.id));
      expect(before).toEqual([]);

      await projectProject(projectId, db);

      // The exact query the /specs page runs (see src/app/specs/page.tsx).
      const domains = await db
        .select({
          id: specDomains.id,
          name: specDomains.name,
          purpose: specDomains.purpose,
          projectId: specDomains.projectId,
          projectName: projects.name,
          projectRootPath: projects.rootPath,
        })
        .from(specDomains)
        .innerJoin(projects, eq(specDomains.projectId, projects.id));

      // Both real projected capabilities surface — not seed-only data.
      expect(domains.map((d: { name: string }) => d.name).sort()).toEqual([
        "auth",
        "billing",
      ]);
      for (const d of domains) {
        expect(d.projectName).toBe("Real Fixture Project");
        expect(d.projectRootPath).toBe(root);
      }
    },
    TIMEOUT,
  );
});
