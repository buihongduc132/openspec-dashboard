import { db } from "@/db";
import {
  auditLogs,
  changes,
  deltaSpecs,
  projects,
  requirements,
  scenarios,
  specs,
  specDomains,
  tasks,
} from "@/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import { computeVelocity, type VelocityOptions, type VelocitySeries } from "@/lib/dashboard-analytics/velocity";
import {
  computeOrgRollup,
  computeActivityHeatmap,
  type ProjectRollupInput,
  type OrgRollup,
  type HeatmapCell,
} from "@/lib/dashboard-analytics/multiproject";
import {
  computeSpecCoverage,
  type DomainCoverageInput,
  type SpecCoverageResult,
} from "@/lib/dashboard-analytics/spec-coverage";
import {
  computeArchiveAnalytics,
  type ArchiveChangeInput,
  type ArchiveAnalytics,
} from "@/lib/dashboard-analytics/archive";
import {
  computeContributorStats,
  type ContributorEventInput,
  type ContributorStat,
  type ContributorStatsOptions,
} from "@/lib/dashboard-analytics/contributor";

/**
 * Audit-log backed analytics (task 2.22 — req 7.3 activity timeline +
 * req 7.5 task velocity).
 *
 * These helpers read the per-project `audit_logs` table (Phase 0 hash-chain
 * audit log). They are index-backed project-scoped queries; the pure
 * behavioural logic (deep-link mapping, bucket math) lives in
 * `@/lib/dashboard-analytics`.
 */

/** A raw audit-log event projected into the shape the timeline consumes. */
export interface ActivityEventRow {
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  author: string | null;
  createdAt: Date;
}

export interface TimelineFilter {
  /** Restrict to a set of audit actions (e.g. `["task.completed"]`). */
  actionTypes?: string[];
  /** Restrict to a set of actors (audit `author`). */
  actors?: string[];
  /** Restrict to a set of change ids (audit `entityId` for change entities). */
  changeIds?: string[];
  /** Cap the number of returned events. Defaults to 50. */
  limit?: number;
}

/**
 * Chronological (newest-first) audit-log feed for a project (req 7.3).
 * Supports filtering by event type, actor, and change (AC 7.3b).
 */
export async function getProjectActivityTimeline(
  projectId: string,
  filter: TimelineFilter = {}
): Promise<ActivityEventRow[]> {
  const conditions = [eq(auditLogs.projectId, projectId)];
  if (filter.actionTypes?.length) {
    conditions.push(inArray(auditLogs.action, filter.actionTypes));
  }
  if (filter.actors?.length) {
    conditions.push(inArray(auditLogs.author, filter.actors));
  }
  if (filter.changeIds?.length) {
    conditions.push(inArray(auditLogs.entityId, filter.changeIds));
  }

  return db
    .select({
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      details: auditLogs.details,
      author: auditLogs.author,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(asc(auditLogs.createdAt))
    .limit(filter.limit ?? 50);
}

/**
 * Task velocity for a project (req 7.5). Pulls audit-log task-completion
 * events (req 7.5a) and buckets them over a configurable window (req 7.5b).
 */
export async function getProjectVelocity(
  projectId: string,
  options: VelocityOptions
): Promise<VelocitySeries> {
  const completions = await getProjectVelocityCompletions(projectId);
  return computeVelocity(completions, options);
}

/**
 * Raw task-completion timestamps for a project (req 7.5a). Exposed so the
 * client-side velocity chart can re-bucket interactively without a DB hit
 * when the window changes.
 */
export async function getProjectVelocityCompletions(
  projectId: string
): Promise<Date[]> {
  const rows = await db
    .select({ createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.projectId, projectId),
        eq(auditLogs.action, "task.completed")
      )
    )
    .orderBy(asc(auditLogs.createdAt));

  return rows.map((r) => r.createdAt);
}

// ─── Phase 4 — Analytics dashboards (req 07.2, 07.4, 07.6, 07.7) ─────────────

/**
 * These fetchers read the existing per-project tables and assemble the inputs
 * the pure behavioural cores in `@/lib/dashboard-analytics/*` consume. They
 * are index-backed counts/joins; no analytics math lives here.
 */

// ── req 7.2 — Multi-project overview (org rollups + activity heatmap) ────────

/**
 * Per-project rollup inputs for the org-level overview (req 7.2).
 *
 * "Active changes" = in-flight (non-archived). "Open validation errors" is the
 * sum of criticalIssues across the project's verification reports.
 */
export async function getProjectRollupInputs(): Promise<ProjectRollupInput[]> {
  const allProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .orderBy(asc(projects.createdAt));

  return Promise.all(
    allProjects.map(async (p) => {
      const [{ activeChanges }] = await db
        .select({ activeChanges: count() })
        .from(changes)
        .where(and(eq(changes.projectId, p.id), ne(changes.status, "archived")));

      // Open validation errors: aggregate criticalIssues for this project's
      // changes' verification reports.
      const errRows = await db
        .select({ critical: sql<number>`coalesce(sum(verification_reports.critical_issues), 0)::int` })
        .from(sql`verification_reports`)
        .innerJoin(changes, sql`verification_reports.change_id = ${changes.id}`)
        .where(eq(changes.projectId, p.id));
      const openValidationErrors = Number(errRows[0]?.critical ?? 0);

      const [{ taskTotal }] = await db
        .select({ taskTotal: count() })
        .from(tasks)
        .where(eq(tasks.projectId, p.id));
      const [{ taskDone }] = await db
        .select({ taskDone: count() })
        .from(tasks)
        .where(and(eq(tasks.projectId, p.id), eq(tasks.status, "done")));

      const [{ lastActivityAt }] = await db
        .select({ lastActivityAt: sql<Date>`max(${auditLogs.createdAt})` })
        .from(auditLogs)
        .where(eq(auditLogs.projectId, p.id));

      const [{ owner }] = await db
        .select({ owner: tasks.assignee })
        .from(tasks)
        .where(and(eq(tasks.projectId, p.id), sql`${tasks.assignee} is not null`))
        .orderBy(asc(tasks.orderIndex))
        .limit(1);

      return {
        id: p.id,
        activeChanges: Number(activeChanges),
        openValidationErrors,
        taskTotal: Number(taskTotal),
        taskDone: Number(taskDone),
        lastActivityAt: lastActivityAt ?? null,
        owner: owner ?? null,
      } satisfies ProjectRollupInput;
    })
  );
}

/** Org-level rollup across all enrolled projects (req 7.2). */
export async function getOrgRollup(): Promise<OrgRollup> {
  return computeOrgRollup(await getProjectRollupInputs());
}

/**
 * Cross-project activity heatmap by day over a trailing window (req 7.2 AC b).
 * Pulls every audit-log event across all projects and buckets it.
 */
export async function getCrossProjectActivityHeatmap(
  windowDays: number
): Promise<HeatmapCell[]> {
  const rows = await db
    .select({ createdAt: auditLogs.createdAt })
    .from(auditLogs);
  return computeActivityHeatmap(
    rows.map((r) => ({ createdAt: r.createdAt })),
    { windowDays }
  );
}

// ── req 7.4 — Spec coverage heatmap ──────────────────────────────────────────

/**
 * Per-domain coverage inputs for the spec-coverage heatmap (req 7.4).
 * Joins specDomains → specs → requirements/scenarios, counts active changes
 * touching each domain via delta_specs, and sums verification errors.
 */
export async function getSpecCoverageInputs(
  projectId: string
): Promise<DomainCoverageInput[]> {
  const domains = await db
    .select({
      domainId: specDomains.id,
      domainName: specDomains.name,
    })
    .from(specDomains)
    .where(eq(specDomains.projectId, projectId));

  return Promise.all(
    domains.map(async (d) => {
      const [{ requirementCount }] = await db
        .select({ requirementCount: count() })
        .from(requirements)
        .innerJoin(specs, eq(requirements.specId, specs.id))
        .where(eq(specs.domainId, d.domainId));

      const [{ scenarioCount }] = await db
        .select({ scenarioCount: count() })
        .from(scenarios)
        .innerJoin(requirements, eq(scenarios.requirementId, requirements.id))
        .innerJoin(specs, eq(requirements.specId, specs.id))
        .where(eq(specs.domainId, d.domainId));

      const [{ activeChangesTouching }] = await db
        .select({ activeChangesTouching: count() })
        .from(deltaSpecs)
        .innerJoin(
          changes,
          and(
            eq(deltaSpecs.changeId, changes.id),
            ne(changes.status, "archived")
          )
        )
        .where(eq(deltaSpecs.domainId, d.domainId));

      const errRows = await db
        .select({ critical: sql<number>`coalesce(sum(verification_reports.critical_issues), 0)::int` })
        .from(deltaSpecs)
        .innerJoin(changes, eq(deltaSpecs.changeId, changes.id))
        .innerJoin(
          sql`verification_reports`,
          sql`verification_reports.change_id = ${changes.id}`
        )
        .where(eq(deltaSpecs.domainId, d.domainId));
      const validationErrors = Number(errRows[0]?.critical ?? 0);

      return {
        projectId,
        domainId: d.domainId,
        domainName: d.domainName,
        requirementCount: Number(requirementCount),
        scenarioCount: Number(scenarioCount),
        activeChangesTouching: Number(activeChangesTouching),
        validationErrors,
      } satisfies DomainCoverageInput;
    })
  );
}

/** Spec-coverage heatmap for a project (req 7.4). */
export async function getSpecCoverage(
  projectId: string
): Promise<SpecCoverageResult> {
  return computeSpecCoverage(await getSpecCoverageInputs(projectId));
}

// ── req 7.6 — Archive analytics ──────────────────────────────────────────────

/**
 * Archived-change inputs for archive analytics (req 7.6).
 *
 * The audit log records `change.archived` events (per `describeActivityEvent`
 * in timeline.ts) carrying the change's creation context via `details`.
 * AC 7.6(a): sourced from archived changes + audit log. We use the change
 * row's createdAt and the archived audit event's createdAt as the archive
 * timestamp; touched domains come from delta_specs.
 */
export async function getArchiveAnalyticsInputs(): Promise<ArchiveChangeInput[]> {
  const archivedChanges = await db
    .select({
      changeId: changes.id,
      changeName: changes.name,
      projectId: changes.projectId,
      createdAt: changes.createdAt,
    })
    .from(changes)
    .where(eq(changes.status, "archived"));

  if (archivedChanges.length === 0) return [];

  return Promise.all(
    archivedChanges.map(async (c) => {
      const [{ archivedAt }] = await db
        .select({ archivedAt: sql<Date>`min(${auditLogs.createdAt})` })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, "change.archived"),
            eq(auditLogs.entityType, "change"),
            eq(auditLogs.entityId, c.changeId)
          )
        );

      const domainRows = await db
        .select({ domainId: deltaSpecs.domainId })
        .from(deltaSpecs)
        .where(eq(deltaSpecs.changeId, c.changeId));

      return {
        projectId: c.projectId,
        changeId: c.changeId,
        changeName: c.changeName,
        createdAt: c.createdAt,
        archivedAt: archivedAt ?? c.createdAt,
        domainIds: domainRows.map((d) => d.domainId),
      } satisfies ArchiveChangeInput;
    })
  );
}

/** Archive analytics across all projects (req 7.6). */
export async function getArchiveAnalytics(): Promise<ArchiveAnalytics> {
  return computeArchiveAnalytics(await getArchiveAnalyticsInputs());
}

// ── req 7.7 — Contributor analytics ──────────────────────────────────────────

/** Contributor-relevant audit actions (req 7.7). */
const CONTRIBUTOR_ACTIONS: ContributorEventInput["action"][] = [
  "task.completed",
  "change.archived",
  "spec.authored",
  "validation.error.introduced",
  "validation.error.resolved",
];

/**
 * Contributor stats from the audit log (req 7.7).
 *
 * Attribution comes from `auditLogs.author`; null/empty authors collapse into
 * "Unattributed" inside the pure core (AC 7.7a). Pass `anonymous: true` for
 * privacy-respecting display (AC 7.7b).
 */
export async function getContributorStats(
  options: ContributorStatsOptions = {}
): Promise<ContributorStat[]> {
  const rows = await db
    .select({
      author: auditLogs.author,
      action: auditLogs.action,
    })
    .from(auditLogs)
    .where(inArray(auditLogs.action, CONTRIBUTOR_ACTIONS));

  const events: ContributorEventInput[] = rows.map((r) => ({
    author: r.author,
    action: r.action as ContributorEventInput["action"],
  }));
  return computeContributorStats(events, options);
}
