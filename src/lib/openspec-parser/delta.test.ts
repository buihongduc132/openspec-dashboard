/**
 * Task 3.3 — Delta grammar parser (ADDED / MODIFIED / REMOVED / RENAMED) tests.
 *
 * RED phase: these tests import `@/lib/openspec-parser/delta` which does not
 * exist yet, so they fail for the right reason (module missing). Each verb is
 * exercised, plus the REMOVED Reason+Migration validation rule and byte-fidelity
 * round-trip (NFR-4).
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`,
 * Requirement "Delta grammar (ADDED / MODIFIED / REMOVED / RENAMED)".
 */
import { describe, it, expect } from "vitest";
import {
  parseDeltaSpec,
  serializeDeltaSpec,
  type DeltaModel,
} from "@/lib/openspec-parser/delta";

const FULL_DELTA = `## ADDED Requirements

### Requirement: Login SHALL support MFA
The system SHALL accept a TOTP as a second factor.

#### Scenario: MFA-enrolled user logs in
- **WHEN** an MFA-enrolled user submits valid credentials plus a valid TOTP
- **THEN** the system SHALL respond with 200

## MODIFIED Requirements

### Requirement: Login SHALL issue a session token
The system SHALL issue a session token that expires after 24 hours.

## REMOVED Requirements

### Requirement: Legacy cookie auth
**Reason:** Replaced by the MFA + session-token flow.
**Migration:** Clients MUST switch to the session-token endpoint; cookie auth returns 410.

## RENAMED Requirements

### Requirement: Session Token
- **FROM:** Session Token
- **TO:** Auth Token
`;

describe("task 3.3 — delta verb parsing", () => {
  it("ADDED block parses into added[] carrying body + scenarios", () => {
    const { model, issues } = parseDeltaSpec(FULL_DELTA, "delta.md");
    expect(issues).toEqual([]);
    expect(model.added).toHaveLength(1);
    const added = model.added[0];
    expect(added.name).toBe("Login SHALL support MFA");
    expect(added.body).toContain("TOTP as a second factor");
    expect(added.scenarios).toHaveLength(1);
    expect(added.scenarios[0].name).toBe("MFA-enrolled user logs in");
  });

  it("MODIFIED block parses into modified[]", () => {
    const { model, issues } = parseDeltaSpec(FULL_DELTA, "delta.md");
    expect(issues).toEqual([]);
    expect(model.modified).toHaveLength(1);
    expect(model.modified[0].name).toBe("Login SHALL issue a session token");
  });

  it("REMOVED block parses into removed[] carrying reason + migration", () => {
    const { model, issues } = parseDeltaSpec(FULL_DELTA, "delta.md");
    expect(issues).toEqual([]);
    expect(model.removed).toHaveLength(1);
    const removed = model.removed[0];
    expect(removed.name).toBe("Legacy cookie auth");
    expect(removed.reason).toBe("Replaced by the MFA + session-token flow.");
    expect(removed.migration).toBe(
      "Clients MUST switch to the session-token endpoint; cookie auth returns 410.",
    );
  });

  it("RENAMED block parses FROM/TO into renamed[]", () => {
    const { model, issues } = parseDeltaSpec(FULL_DELTA, "delta.md");
    expect(issues).toEqual([]);
    expect(model.renamed).toHaveLength(1);
    expect(model.renamed[0].from).toBe("Session Token");
    expect(model.renamed[0].to).toBe("Auth Token");
  });

  it("sectionPresence reflects which verb sections appeared", () => {
    const { model } = parseDeltaSpec(FULL_DELTA, "delta.md");
    expect(model.sectionPresence).toEqual({
      added: true,
      modified: true,
      removed: true,
      renamed: true,
    });
  });

  it("a single-verb delta only sets that verb's sectionPresence", () => {
    const only = `## ADDED Requirements

### Requirement: Foo
The system SHALL foo.
`;
    const { model } = parseDeltaSpec(only, "delta.md");
    expect(model.added).toHaveLength(1);
    expect(model.sectionPresence).toEqual({
      added: true,
      modified: false,
      removed: false,
      renamed: false,
    });
  });
});

describe("task 3.3 — REMOVED Reason+Migration validation", () => {
  it("flags a structured validation error when REMOVED omits Migration", () => {
    const missing = `## REMOVED Requirements

### Requirement: Legacy cookie auth
**Reason:** Replaced by the new flow.
`;
    const { model, issues } = parseDeltaSpec(missing, "delta.md");
    expect(model.removed).toHaveLength(1);
    expect(model.removed[0].reason).toBe("Replaced by the new flow.");
    expect(model.removed[0].migration).toBeUndefined();
    const err = issues.find((i) => i.kind === "removed-missing-migration");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("error");
    expect(err!.message).toContain("Legacy cookie auth");
  });

  it("flags an error when REMOVED omits both Reason and Migration", () => {
    const bare = `## REMOVED Requirements

### Requirement: Legacy cookie auth
`;
    const { issues } = parseDeltaSpec(bare, "delta.md");
    expect(issues.some((i) => i.kind === "removed-missing-reason")).toBe(true);
    expect(issues.some((i) => i.kind === "removed-missing-migration")).toBe(true);
  });

  it("does not flag when REMOVED has both Reason and Migration", () => {
    const { issues } = parseDeltaSpec(FULL_DELTA, "delta.md");
    expect(issues.some((i) => i.kind.startsWith("removed-missing"))).toBe(false);
  });
});

describe("task 3.3 — delta byte-fidelity round-trip (NFR-4)", () => {
  it("serialize reproduces the input bytes exactly when unedited", () => {
    const { model } = parseDeltaSpec(FULL_DELTA, "delta.md");
    expect(serializeDeltaSpec(model)).toBe(FULL_DELTA);
  });

  it("parse → serialize → re-parse yields a structurally equal model", () => {
    const { model: first } = parseDeltaSpec(FULL_DELTA, "delta.md");
    const round = serializeDeltaSpec(first);
    const { model: second } = parseDeltaSpec(round, "delta.md");
    expect(second.added.length).toBe(first.added.length);
    expect(second.modified.length).toBe(first.modified.length);
    expect(second.removed.length).toBe(first.removed.length);
    expect(second.renamed.length).toBe(first.renamed.length);
    expect(second.removed[0]).toEqual(first.removed[0]);
    expect(second.renamed[0]).toEqual(first.renamed[0]);
  });

  it("does not crash on an empty delta spec", () => {
    const { model, issues } = parseDeltaSpec("", "delta.md");
    expect(model.added).toEqual([]);
    expect(model.removed).toEqual([]);
    expect(issues).toEqual([]);
  });
});
