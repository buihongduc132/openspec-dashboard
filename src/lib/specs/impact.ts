/**
 * Task 2.15 — Spec impact analysis (req 02 §2.8).
 *
 * For any spec domain, shows every active change whose delta touches it,
 * broken down by verb (ADDED / MODIFIED / REMOVED / RENAMED) and per
 * requirement. Computed by parsing every `changes/<name>/specs/<domain>.md`
 * delta and joining on the domain name (D-ReqID).
 *
 * The result is structured for two UI surfaces:
 *  - `changes`: per-change, per-verb breakdown (the "what does each change
 *    propose for this domain?" view, req 02 §2.8 + req 06 §6.4 conflict input).
 *  - `requirementSummary`: per-requirement roll-up across all changes (the
 *    "which requirements are touched, and by whom?" view, plus the deep-link
 *    target for impact rows → delta sections, req 02 §2.8 AC c).
 *
 * Source: `flow/requirements/02-specs.md` §2.8.
 */

import type { DeltaSpec, RequirementBlock } from "@/lib/openspec-parser";

/** The parsed delta plan for a single domain (ADDED/MODIFIED/REMOVED/RENAMED). */
export type DeltaPlan = DeltaSpec["plan"];

/** A change and the parsed delta plans it carries, keyed by domain. */
export interface ImpactChange {
  name: string;
  deltas: Record<string, DeltaPlan>;
}

/** Per-verb requirement names touched by a single change on the target domain. */
export interface ImpactVerbBreakdown {
  added: string[];
  modified: string[];
  removed: string[];
  renamed: { from: string; to: string }[];
}

/** One change's impact on the target domain. */
export interface ImpactChangeRow {
  change: string;
  verbs: ImpactVerbBreakdown;
}

/** A requirement-level roll-up across every change touching the domain. */
export interface ImpactRequirementSummary {
  requirement: string;
  /** Distinct verbs touching this requirement, sorted lexicographically. */
  verbs: string[];
  /** Changes that touch this requirement, in encounter order. */
  changes: string[];
}

/** Full impact report for a single target domain. */
export interface ImpactReport {
  domain: string;
  changes: ImpactChangeRow[];
  requirementSummary: ImpactRequirementSummary[];
}

const EMPTY_VERBS: ImpactVerbBreakdown = {
  added: [],
  modified: [],
  removed: [],
  renamed: [],
};

/**
 * Compute the spec impact report for `domain` across the supplied changes.
 * Changes whose `deltas` map has no entry for `domain` are skipped. The report
 * is deterministic: changes appear in input order, requirements within a verb
 * in source order, and the summary's verbs/changes are sorted for stable
 * output (cache key friendliness, req 02 §2.8 AC a).
 */
export function analyzeSpecImpact(
  changes: ImpactChange[],
  domain: string,
): ImpactReport {
  const rows: ImpactChangeRow[] = [];

  for (const change of changes) {
    const plan = change.deltas[domain];
    if (!plan) continue;
    const verbs: ImpactVerbBreakdown = {
      added: plan.added.map(nameOf),
      modified: plan.modified.map(nameOf),
      removed: [...plan.removed],
      renamed: [...plan.renamed],
    };
    rows.push({ change: change.name, verbs });
  }

  // Per-requirement roll-up. A requirement is keyed by the name it is known by
  // in the verb: added/modified/removed use the requirement's own title;
  // renamed contributes both its `from` and `to` names so both sides of a
  // rename are visible in the impact view.
  const summary = new Map<string, ImpactRequirementSummary>();
  const touch = (
    req: string,
    verb: string,
    change: string,
  ): void => {
    let entry = summary.get(req);
    if (!entry) {
      entry = { requirement: req, verbs: [], changes: [] };
      summary.set(req, entry);
    }
    if (!entry.verbs.includes(verb)) entry.verbs.push(verb);
    if (!entry.changes.includes(change)) entry.changes.push(change);
  };

  for (const row of rows) {
    for (const name of row.verbs.added) touch(name, "added", row.change);
    for (const name of row.verbs.modified) touch(name, "modified", row.change);
    for (const name of row.verbs.removed) touch(name, "removed", row.change);
    for (const pair of row.verbs.renamed) {
      touch(pair.from, "renamed", row.change);
      touch(pair.to, "renamed", row.change);
    }
  }

  const requirementSummary = [...summary.values()]
    .sort((a, b) => a.requirement.localeCompare(b.requirement))
    .map((entry) => ({
      ...entry,
      verbs: [...entry.verbs].sort(),
      changes: [...entry.changes],
    }));

  return { domain, changes: rows, requirementSummary };
}

/** Extract the requirement name from a parsed block. */
function nameOf(block: RequirementBlock): string {
  return block.name;
}

export { EMPTY_VERBS };
