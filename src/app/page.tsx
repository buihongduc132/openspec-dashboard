import { db } from "@/db";
import {
  projects,
  changes,
  specDomains,
  specs,
  requirements,
  tasks,
} from "@/db/schema";
import { count, eq, and, asc } from "drizzle-orm";
import { DashboardView } from "@/components/dashboard-view";
import type { ProjectView } from "@/components/v4/types";
import type { FlowItem, PlanRow } from "@/components/v4/types";
import {
  accentForIndex,
  healthFromProgress,
  taskStatusToPlan,
  timeAgo,
  type PlanStatus,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const FLOW_ITEM_CAP = 6; // per project, per column (matches FlowBoard single-project limit)

export default async function DashboardPage() {
  const allProjects = await db.select().from(projects).orderBy(asc(projects.createdAt));

  // ── Build per-project v4 views from real DB rows ──────────────────────────
  const views: ProjectView[] = await Promise.all(
    allProjects.map(async (p, index) => {
      // Counts + progress
      const [{ count: taskTotal }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.projectId, p.id));
      const [{ count: taskDone }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(and(eq(tasks.projectId, p.id), eq(tasks.status, "done")));
      const [{ count: changeCount }] = await db
        .select({ count: count() })
        .from(changes)
        .where(eq(changes.projectId, p.id));
      const [{ count: activeChangeCount }] = await db
        .select({ count: count() })
        .from(changes)
        .where(
          and(
            eq(changes.projectId, p.id),
            eq(changes.status, "in-progress")
          )
        );
      const [{ count: riskCount }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(and(eq(tasks.projectId, p.id), eq(tasks.priority, "high")));

      const progress = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

      // Flow: findings (spec domains) ─────────────────────────────────────────
      const domains = await db
        .select({ name: specDomains.name, purpose: specDomains.purpose })
        .from(specDomains)
        .where(eq(specDomains.projectId, p.id))
        .limit(FLOW_ITEM_CAP);

      const findings: FlowItem[] = domains.map((d) => ({
        title: d.name,
        detail: d.purpose?.trim() || "Spec domain registered for this project.",
        state: "Observed",
      }));

      // Flow: requirements (titles from the requirements table) ───────────────
      const reqRows = await db
        .select({
          title: requirements.title,
          body: requirements.body,
          strength: requirements.strength,
        })
        .from(requirements)
        .innerJoin(specs, eq(requirements.specId, specs.id))
        .innerJoin(specDomains, eq(specs.domainId, specDomains.id))
        .where(eq(specDomains.projectId, p.id))
        .limit(FLOW_ITEM_CAP);

      const requirementsFlow: FlowItem[] = reqRows.map((r) => ({
        title: r.title,
        detail: truncate(r.body, 140),
        state: r.strength ?? "SHALL",
      }));

      // Flow: intentions (proposed changes) ───────────────────────────────────
      const proposed = await db
        .select({ name: changes.name, description: changes.description })
        .from(changes)
        .where(and(eq(changes.projectId, p.id), eq(changes.status, "proposed")))
        .limit(FLOW_ITEM_CAP);

      const intentions: FlowItem[] = proposed.map((c) => ({
        title: c.name,
        detail: c.description?.trim() || "Proposed change awaiting implementation.",
        state: "Proposed",
      }));

      // Flow: plans (in-progress changes) ─────────────────────────────────────
      const inProgress = await db
        .select({ name: changes.name, description: changes.description })
        .from(changes)
        .where(
          and(eq(changes.projectId, p.id), eq(changes.status, "in-progress"))
        )
        .limit(FLOW_ITEM_CAP);

      const plansFlow: FlowItem[] = inProgress.map((c) => ({
        title: c.name,
        detail: c.description?.trim() || "Change currently being implemented.",
        state: "In progress",
      }));

      // Plan tracker rows (open tasks, prioritised) ───────────────────────────
      const openTasks = await db
        .select({
          title: tasks.title,
          status: tasks.status,
          assignee: tasks.assignee,
          dueDate: tasks.dueDate,
          taskNumber: tasks.taskNumber,
        })
        .from(tasks)
        .where(eq(tasks.projectId, p.id))
        .orderBy(asc(tasks.orderIndex))
        .limit(10);

      const planRows: PlanRow[] = openTasks.map((t) => ({
        title: t.title,
        owner: t.assignee ?? "Unassigned",
        status: taskStatusToPlan(t.status) as PlanStatus,
        due: t.dueDate ? shortDue(t.dueDate) : "No due date",
      }));

      // Owner = first task assignee, else "—"
      const owner =
        openTasks.find((t) => t.assignee)?.assignee ??
        (changeCount > 0 ? "Maintainer" : "—");

      return {
        id: p.id,
        name: p.name,
        area: p.description?.trim() || p.rootPath || "OpenSpec project",
        owner,
        phase:
          activeChangeCount > 0
            ? `${activeChangeCount} active change${activeChangeCount === 1 ? "" : "s"}`
            : changeCount > 0
            ? "Review / idle"
            : "No changes yet",
        updated: timeAgo(p.updatedAt),
        accent: accentForIndex(index),
        health: healthFromProgress(progress),
        progress,
        risk: Number(riskCount),
        summary: p.description?.trim() || `OpenSpec project rooted at ${p.rootPath}.`,
        activeChanges: Number(activeChangeCount),
        flow: {
          findings,
          requirements: requirementsFlow,
          intentions,
          plans: plansFlow,
        },
        plan: planRows,
      } satisfies ProjectView;
    })
  );

  return <DashboardView projects={views} />;
}

function truncate(value: string | null, max: number): string {
  if (!value) return "";
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function shortDue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
