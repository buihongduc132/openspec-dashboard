/**
 * Task 2.14 — Spec module: propose-via-change flow (req 02 §2.3/§2.4).
 *
 * Serializes a proposed requirement mutation into a delta-spec Markdown
 * section using the upstream OpenSpec heading contract:
 *
 *   ## ADDED|MODIFIED|REMOVED|RENAMED Requirements
 *   ### Requirement: <title>
 *   <body>
 *   #### Scenario: <title>
 *   - **GIVEN** ...
 *   - **WHEN** ...
 *   - **THEN** ...
 *
 * This is the canonical verb contract the parser round-trips in
 * `src/lib/openspec-parser/index.ts` (DELTA_SECTION regex). Producing these
 * sections is what the propose-via-change flow appends to a change's
 * `specs/<domain>/spec.md` delta — main specs are NEVER mutated directly.
 */

/** The four canonical OpenSpec delta verbs, in upstream-canonical order. */
export const DELTA_VERBS = ["ADDED", "MODIFIED", "REMOVED", "RENAMED"] as const;
export type DeltaVerb = (typeof DELTA_VERBS)[number];

/** A Given/When/Then scenario for a proposed requirement. */
export interface ProposedScenario {
  title: string;
  given: string;
  when: string;
  then: string;
}

/** A proposed requirement mutation (verb is supplied at serialize time). */
export interface ProposedRequirement {
  title: string;
  body: string;
  scenarios?: ProposedScenario[];
}

function assertVerb(verb: DeltaVerb): void {
  if (!DELTA_VERBS.includes(verb)) {
    throw new Error(
      `Unknown delta verb "${verb}". Must be one of ${DELTA_VERBS.join(", ")}.`,
    );
  }
}

/**
 * Serialize a single proposed requirement into a delta-spec Markdown section.
 *
 * REMOVED sections render as a bare requirement header (no body/scenarios),
 * matching the upstream grammar where a REMOVED requirement is identified by
 * its title alone. All other verbs emit the full body + scenario blocks.
 */
export function serializeDeltaSection(
  verb: DeltaVerb,
  requirement: ProposedRequirement,
): string {
  assertVerb(verb);
  const lines: string[] = [`## ${verb} Requirements`, ""];

  lines.push(`### Requirement: ${requirement.title}`);

  if (verb !== "REMOVED" && requirement.body.trim().length > 0) {
    lines.push("");
    lines.push(requirement.body.trim());
  }

  if (verb !== "REMOVED") {
    for (const scenario of requirement.scenarios ?? []) {
      lines.push("");
      lines.push(`#### Scenario: ${scenario.title}`);
      lines.push(`- **GIVEN** ${scenario.given}`);
      lines.push(`- **WHEN** ${scenario.when}`);
      lines.push(`- **THEN** ${scenario.then}`);
    }
  }

  return lines.join("\n") + "\n";
}
