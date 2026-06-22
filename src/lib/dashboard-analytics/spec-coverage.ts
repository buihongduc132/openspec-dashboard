/**
 * Spec coverage (req 7.4).
 *
 * Req 7.4: heatmap of spec domains × metric (requirement count, scenario
 * count, active changes touching, validation errors). AC 7.4(a) drill-down to
 * the domain's spec view; AC 7.4(b) "cold spots" (zero requirements) and
 * "hot spots" (>10 active changes) are flagged.
 *
 * This is the pure behavioural core; the DB fetcher in
 * `src/db/analytics.ts` assembles the per-domain inputs.
 */

export type CoverageFlag = "cold" | "hot" | null;

/** A domain must touch strictly more than this many active changes to be hot. */
export const HOT_SPOT_THRESHOLD = 10;

export interface DomainCoverageInput {
  projectId: string;
  domainId: string;
  domainName: string;
  /** Number of requirements in this domain. */
  requirementCount: number;
  /** Number of scenarios across this domain's requirements. */
  scenarioCount: number;
  /** Active (in-flight) changes with deltas touching this domain. */
  activeChangesTouching: number;
  /** Open validation errors attributed to this domain. */
  validationErrors: number;
}

export interface DomainCoverage extends DomainCoverageInput {
  flag: CoverageFlag;
  /** Drill-down href to the domain's spec view (AC 7.4a). */
  href: string;
}

export interface SpecCoverageResult {
  domains: DomainCoverage[];
  /** Count of domains flagged "cold" (zero requirements). */
  coldSpots: number;
  /** Count of domains flagged "hot" (>10 active changes). */
  hotSpots: number;
}

/**
 * Classify a single domain into its coverage flag.
 *
 * - "cold" ⟺ zero requirements (under-specified).
 * - "hot"  ⟺ strictly more than HOT_SPOT_THRESHOLD active changes (over-specified).
 * - cold takes precedence over hot when both apply (a domain with no
 *   requirements is cold regardless of change pressure).
 */
export function classifyDomain(input: DomainCoverageInput): CoverageFlag {
  if (input.requirementCount === 0) return "cold";
  if (input.activeChangesTouching > HOT_SPOT_THRESHOLD) return "hot";
  return null;
}

/**
 * Compute the spec-coverage heatmap over per-domain inputs (req 7.4).
 *
 * Domains are returned in input order; callers that want sorting can sort the
 * returned array. Cold/hot spot counters mirror the per-domain flags.
 */
export function computeSpecCoverage(
  domains: DomainCoverageInput[]
): SpecCoverageResult {
  let coldSpots = 0;
  let hotSpots = 0;

  const mapped: DomainCoverage[] = domains.map((d) => {
    const flag = classifyDomain(d);
    if (flag === "cold") coldSpots += 1;
    else if (flag === "hot") hotSpots += 1;
    return {
      ...d,
      flag,
      href: `/projects/${d.projectId}/specs/${d.domainId}`,
    };
  });

  return { domains: mapped, coldSpots, hotSpots };
}
