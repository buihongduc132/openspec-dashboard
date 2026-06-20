import { describe, it, expect } from "vitest";
import { projects } from "@/db/schema";

/**
 * Task 1.1 — Enrollment-source metadata columns on the `projects` table.
 *
 * The collective-dashboard change reuses the existing `projects` table and adds
 * two columns recording how a project was enrolled:
 *   - `enrollmentSource` ("local" | "remote-git", default "local")
 *   - `remoteGitUrl`    (text, nullable)
 *
 * These tests assert the columns exist on the Drizzle schema with the correct
 * DB column names, data types, defaults, and nullability, so a regression in
 * the schema definition is caught at the unit level.
 */
describe("projects table — enrollment-source columns (task 1.1)", () => {
  it("declares enrollmentSource as a string column defaulting to 'local'", () => {
    const col = (projects as unknown as Record<string, unknown>)
      .enrollmentSource as
      | {
          name: string;
          dataType: string;
          default: unknown;
          notNull: boolean;
        }
      | undefined;

    expect(col, "projects.enrollmentSource column should exist").toBeDefined();
    expect(col!.name).toBe("enrollment_source");
    expect(col!.dataType).toBe("string");
    // Default 'local' applied at the DB layer for existing rows.
    expect(col!.default).toBe("local");
  });

  it("declares remoteGitUrl as a nullable text column", () => {
    const col = (projects as unknown as Record<string, unknown>).remoteGitUrl as
      | {
          name: string;
          dataType: string;
          notNull: boolean;
        }
      | undefined;

    expect(col, "projects.remoteGitUrl column should exist").toBeDefined();
    expect(col!.name).toBe("remote_git_url");
    expect(col!.dataType).toBe("string");
    expect(col!.notNull).toBe(false);
  });
});

/**
 * Task 1.2 — `projected` boolean column on the `projects` table.
 *
 * Stubbed remote projects (enrollmentSource = "remote-git") are recorded in
 * the registry but not yet cloned/projected. The `projected` boolean flags
 * whether the project's contents have been projected. Default is false — a
 * newly enrolled remote project is not projected until clone+projection lands.
 */
describe("projects table — projected column (task 1.2)", () => {
  it("declares projected as a boolean column defaulting to false", () => {
    const col = (projects as unknown as Record<string, unknown>).projected as
      | {
          name: string;
          dataType: string;
          default: unknown;
          notNull: boolean;
        }
      | undefined;

    expect(col, "projects.projected column should exist").toBeDefined();
    expect(col!.name).toBe("projected");
    expect(col!.dataType).toBe("boolean");
    expect(col!.default).toBe(false);
  });
});
