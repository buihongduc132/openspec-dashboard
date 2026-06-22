/**
 * Task 2.14 — Spec module: propose-via-change flow (req 02 §2.3/§2.4).
 *
 * A proposed requirement mutation is serialized into a delta-spec Markdown
 * section using the upstream OpenSpec heading contract
 * (`## ADDED|MODIFIED|REMOVED|RENAMED Requirements` + `### Requirement: <title>`).
 * The serializer is the engine that backs `POST
 * /api/projects/{id}/changes/{changeId}/delta-specs`; rejecting an unknown
 * verb here is what makes the API return 400 before touching the DB.
 */
import { describe, it, expect } from "vitest";
import {
  serializeDeltaSection,
  type ProposedRequirement,
  type DeltaVerb,
  DELTA_VERBS,
} from "./delta-serialize";

describe("serializeDeltaSection (task 2.14)", () => {
  const added: ProposedRequirement = {
    title: "Project registration",
    body: "The dashboard SHALL register OpenSpec repositories as projects.",
    scenarios: [
      { title: "Register a local repo", given: "a form is submitted", when: "the user saves", then: "a project row is created" },
    ],
  };

  it("emits an ADDED section with the upstream heading contract", () => {
    const md = serializeDeltaSection("ADDED", added);
    expect(md.startsWith("## ADDED Requirements\n")).toBe(true);
    expect(md).toContain("### Requirement: Project registration\n");
    expect(md).toContain("The dashboard SHALL register OpenSpec repositories as projects.");
    expect(md).toContain("#### Scenario: Register a local repo");
    expect(md).toContain("- **GIVEN** a form is submitted");
    expect(md).toContain("- **WHEN** the user saves");
    expect(md).toContain("- **THEN** a project row is created");
  });

  it("supports MODIFIED / REMOVED / RENAMED verbs", () => {
    expect(serializeDeltaSection("MODIFIED", added).startsWith("## MODIFIED Requirements\n")).toBe(true);
    expect(serializeDeltaSection("REMOVED", added).startsWith("## REMOVED Requirements\n")).toBe(true);
    expect(serializeDeltaSection("RENAMED", added).startsWith("## RENAMED Requirements\n")).toBe(true);
  });

  it("throws on an unknown verb so the API returns 400 instead of writing garbage", () => {
    expect(() => serializeDeltaSection("UPSERT" as DeltaVerb, added)).toThrow(/verb/i);
  });

  it("REMOVED serializes as a bare requirement-name list (per upstream grammar)", () => {
    const md = serializeDeltaSection("REMOVED", { title: "Old requirement", body: "" });
    expect(md).toContain("## REMOVED Requirements\n");
    expect(md).toContain("### Requirement: Old requirement");
    // No body prose emitted when body is empty.
    expect(md.split("\n").filter((l) => l.trim()).length).toBeLessThanOrEqual(2);
  });

  it("DELTA_VERBS advertises the canonical 4 verbs in order", () => {
    expect(DELTA_VERBS).toEqual(["ADDED", "MODIFIED", "REMOVED", "RENAMED"]);
  });
});
