/**
 * Task 2.15 — Spec impact analysis unit tests (req 02 §2.8).
 *
 * Source: `flow/requirements/02-specs.md` §2.8. For any spec domain, the
 * dashboard shows every active change whose delta touches it, broken down by
 * verb (ADDED / MODIFIED / REMOVED / RENAMED) and per-requirement. Computed by
 * parsing every `changes/<name>/specs/<domain>.md` delta and joining on domain.
 */
import { describe, it, expect } from "vitest";
import { analyzeSpecImpact, type ImpactChange } from "@/lib/specs/impact";

const present = { added: false, modified: false, removed: false, renamed: false };

const CHANGES: ImpactChange[] = [
  {
    name: "add-auth",
    deltas: {
      auth: {
        added: [{ name: "Login", body: "", scenarios: [], line: 1 }],
        modified: [],
        removed: [],
        renamed: [],
        sectionPresence: { ...present, added: true },
      },
    },
  },
  {
    name: "refactor-tasks",
    deltas: {
      tasks: {
        added: [],
        modified: [{ name: "Kanban", body: "", scenarios: [], line: 1 }],
        removed: ["LegacyBoard"],
        renamed: [],
        sectionPresence: { ...present, modified: true, removed: true },
      },
    },
  },
  {
    name: "rename-auth-req",
    deltas: {
      auth: {
        added: [],
        modified: [],
        removed: [],
        renamed: [{ from: "Login", to: "SignIn" }],
        sectionPresence: { ...present, renamed: true },
      },
    },
  },
];

describe("analyzeSpecImpact", () => {
  it("collects every change touching the target domain, grouped by verb", () => {
    const report = analyzeSpecImpact(CHANGES, "auth");
    expect(report.domain).toBe("auth");
    expect(report.changes.map((c) => c.change)).toEqual([
      "add-auth",
      "rename-auth-req",
    ]);
  });

  it("breaks each change down per-verb and per-requirement", () => {
    const report = analyzeSpecImpact(CHANGES, "auth");
    const addAuth = report.changes.find((c) => c.change === "add-auth");
    expect(addAuth?.verbs.added).toEqual(["Login"]);
    expect(addAuth?.verbs.modified).toEqual([]);
    expect(addAuth?.verbs.removed).toEqual([]);
    expect(addAuth?.verbs.renamed).toEqual([]);

    const rename = report.changes.find((c) => c.change === "rename-auth-req");
    expect(rename?.verbs.renamed).toEqual([{ from: "Login", to: "SignIn" }]);
  });

  it("returns no changes for an untouched domain", () => {
    const report = analyzeSpecImpact(CHANGES, "schemas");
    expect(report.changes).toEqual([]);
  });

  it("aggregates a requirement-level summary across all changes", () => {
    const report = analyzeSpecImpact(CHANGES, "auth");
    // "Login" is added by add-auth and renamed by rename-auth-req.
    const login = report.requirementSummary.find((r) => r.requirement === "Login");
    expect(login).toBeDefined();
    expect(login?.verbs.sort()).toEqual(["added", "renamed"]);
    expect(login?.changes).toEqual(["add-auth", "rename-auth-req"]);
  });
});
