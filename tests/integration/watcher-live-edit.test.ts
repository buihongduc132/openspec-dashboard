/**
 * Task 9.5 (cycle 5) — watcher live-edit smoke (end-to-end with real chokidar).
 *
 * The smoke task says: "Edit a real `spec.md` on disk, wait > 500ms, refresh
 * `/specs`, confirm the watcher propagated the edit." The automatable
 * invariant underneath that manual browser check is the full PRODUCTION event
 * chain that task 8.3 wired:
 *
 *   disk edit → real chokidar 'all' event → 500ms debounce → onEvent →
 *   process-wide queue-instance → projectProject worker → DB row updated.
 *
 * Unlike `watcher.test.ts` (which mocks chokidar), this test uses the REAL
 * chokidar watcher, the REAL production wiring (`projectProject` auto-starts
 * the watcher via `ensureWatcher`, whose `onEvent` enqueues via the real
 * `queue-instance`), and a real Postgres testcontainer DB. It edits a
 * requirement body on disk and polls the DB until the row reflects the new
 * body — proving a browser refresh of `/specs` would show the propagated edit.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { requirements } from "@/db/schema";
import { projectProject } from "@/lib/projection/project";
import { stopWatch, resetWatcherRegistry, watcherReady } from "@/lib/projection/watcher";
import { resetProjectionQueue } from "@/lib/projection/queue-instance";
import "./setup";

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TIMEOUT = 60_000;
/**
 * Generous propagation window. Production timing is:
 *   awaitWriteFinish.stabilityThreshold (500ms) + debounce (500ms) + dynamic
 *   import of queue-instance + a full projectProject pass. We poll rather
 *   than sleep a fixed duration so the test resolves as soon as the row flips.
 */
const PROPAGATION_DEADLINE_MS = 8000;
const POLL_INTERVAL_MS = 150;

function buildFixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "watcher-live-edit-"));
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
  return root;
}

describe("task 9.5 — real chokidar watcher propagates a live disk edit into the DB", () => {
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
    resetWatcherRegistry();
    resetProjectionQueue();
    await pool.query("truncate projects cascade");
    const ins = await pool.query(
      "insert into projects (name, root_path) values ($1, $2) returning id",
      ["Watcher Live Edit Fixture", root],
    );
    projectId = ins.rows[0].id;
  }, TIMEOUT);

  afterEach(async () => {
    await stopWatch(projectId).catch(() => {});
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it(
    "edits a spec.md on disk and the DB requirement row updates after the debounce",
    async () => {
      // 1. Initial projection seeds the DB AND auto-starts the production
      //    chokidar watcher (task 8.3 ensureWatcher) whose onEvent enqueues
      //    via the real queue-instance bound to projectProject.
      await projectProject(projectId, db);
      // Await chokidar's `ready` event so the live edit below does not race
      // watcher startup (inotify watches must be installed before the write
      // for the change event to fire).
      await watcherReady(projectId);
      const [before] = await db
        .select()
        .from(requirements)
        .where(eq(requirements.title, "Login"));
      expect(before.body).toBe("Users shall log in.");

      // 2. Wait for chokidar to finish its initial scan ("ready" event).
      //    Without this settle, edits made during the initial scan are ignored.
      await new Promise((r) => setTimeout(r, 1000));

      // 3. Edit the requirement body on disk (the live-edit under test).
      writeFileSync(
        path.join(root, "openspec", "specs", "auth", "spec.md"),
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
        ].join("\n"),
      );

      // 4. Poll the DB until the watcher chain propagates the edit. This is
      //    exactly what a human refreshing /specs after >500ms would observe.
      const propagated = await new Promise<boolean>((resolve) => {
        const deadline = Date.now() + PROPAGATION_DEADLINE_MS;
        const tick = async () => {
          const [row] = await db
            .select()
            .from(requirements)
            .where(eq(requirements.title, "Login"));
          if (row && row.body.includes("MFA")) return resolve(true);
          if (Date.now() >= deadline) return resolve(false);
          setTimeout(tick, POLL_INTERVAL_MS);
        };
        void tick();
      });

      // 5. The watcher propagated the edit — a browser refresh of /specs
      //    would now show "MFA".
      expect(
        propagated,
        "watcher did not propagate the live edit within the window",
      ).toBe(true);
    },
    TIMEOUT,
  );
});
