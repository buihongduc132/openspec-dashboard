import { db } from "@/db";
import Link from "next/link";
import { changes, projects, artifacts, tasks } from "@/db/schema";
import { count, eq, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  GitBranchPlus,
  Plus,
  FileText,
  Code2,
  ListChecks,
  BookOpen,
  Lightbulb,
  Clock,
  Filter,
  ArrowUpRight,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

export const dynamic = "force-dynamic";

const statusMeta: Record<string, { label: string; variant: "slate" | "info" | "warning" | "success" | "purple" }> = {
  proposed: { label: "Proposed", variant: "info" },
  "in-progress": { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  archived: { label: "Archived", variant: "slate" },
};

const artifactIcons = {
  proposal: Lightbulb,
  design: Code2,
  specs: BookOpen,
  tasks: ListChecks,
} as const;

export default async function ChangesPage() {
  const allChanges = await db
    .select({
      id: changes.id,
      name: changes.name,
      status: changes.status,
      description: changes.description,
      createdAt: changes.createdAt,
      updatedAt: changes.updatedAt,
      projectId: changes.projectId,
      projectName: projects.name,
      projectRootPath: projects.rootPath,
    })
    .from(changes)
    .innerJoin(projects, eq(changes.projectId, projects.id))
    .orderBy(desc(changes.updatedAt));

  // For each change, count artifacts and tasks
  const changesWithStats = await Promise.all(
    allChanges.map(async (c) => {
      const artifactRows = await db
        .select({ type: artifacts.type, status: artifacts.status })
        .from(artifacts)
        .where(eq(artifacts.changeId, c.id));

      const [{ count: taskCount }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.changeId, c.id));

      const [{ count: doneTasks }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(sql`${tasks.changeId} = ${c.id} AND ${tasks.status} = 'done'`);

      return {
        ...c,
        artifactTypes: artifactRows.map((a) => a.type),
        artifactStatus: Object.fromEntries(
          artifactRows.map((a) => [a.type, a.status])
        ) as Record<string, string>,
        taskCount,
        doneTasks,
      };
    })
  );

  const counts = {
    total: allChanges.length,
    proposed: allChanges.filter((c) => c.status === "proposed").length,
    inProgress: allChanges.filter((c) => c.status === "in-progress").length,
    completed: allChanges.filter((c) => c.status === "completed").length,
  };

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <GitBranchPlus className="h-3 w-3" /> Changes
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">All Changes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Proposals, designs, deltas, and tasks across every project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Filter
          </Button>
          <Button size="sm" asChild>
            <Link href="/projects/new">
              <Plus className="h-3.5 w-3.5" /> New Change
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border/60 py-3 shadow-none">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{counts.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 py-3 shadow-none">
          <CardContent className="px-4">
            <p className="text-xs text-blue-500">Proposed</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{counts.proposed}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 py-3 shadow-none">
          <CardContent className="px-4">
            <p className="text-xs text-amber-500">In Progress</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{counts.inProgress}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 py-3 shadow-none">
          <CardContent className="px-4">
            <p className="text-xs text-emerald-500">Completed</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{counts.completed}</p>
          </CardContent>
        </Card>
      </div>

      <Separator className="mb-6" />

      {/* Change list */}
      {changesWithStats.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-muted/30 shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <GitBranchPlus className="mb-3 h-8 w-8 text-muted-foreground" />
            <h3 className="text-base font-medium">No changes yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a new change to propose modifications to your specs.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-none">
          <div className="divide-y divide-border/60">
            {changesWithStats.map((c) => {
              const meta = statusMeta[c.status] ?? statusMeta.proposed;
              const taskPct = c.taskCount > 0 ? Math.round((c.doneTasks / c.taskCount) * 100) : 0;
              const artifactOrder = ["proposal", "specs", "design", "tasks"] as const;
              return (
                <div
                  key={c.id}
                  className="group relative flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                >
                  {/* Full-row navigation as an absolute overlay (z-0) so the
                   * icon-only Copy reference control (z-10) stays clickable. */}
                  <Link
                    href={`/projects/${c.projectId}/changes/${c.id}`}
                    className="absolute inset-0 z-0"
                    aria-label={c.name}
                  />
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-violet-500/10 group-hover:text-violet-500">
                      <GitBranchPlus className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium">{c.name}</span>
                        <Badge variant={meta.variant} className="h-4.5 rounded-sm px-1.5 text-[10px] font-normal">
                          {meta.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">· {c.projectName}</span>
                      </div>
                      {c.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {artifactOrder.map((type) => {
                          const present = c.artifactTypes.includes(type);
                          const done = c.artifactStatus[type] === "approved" || c.artifactStatus[type] === "done";
                          return (
                            <div
                              key={type}
                              className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] capitalize ${
                                present
                                  ? done
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  : "border-border/60 bg-muted/30 text-muted-foreground/50"
                              }`}
                            >
                              {type}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-5 sm:gap-6">
                    {/*
                     * Icon-only Copy reference control per change row (task
                     * 4.5). Built from the already-fetched change row +
                     * project rootPath (design D1). z-10 keeps it above the
                     * row navigation overlay.
                     */}
                    <CopyReferenceButton
                      iconOnly
                      className="relative z-10 h-7 w-7"
                      reference={buildEntityReference(
                        "change",
                        {
                          id: c.id,
                          name: c.name,
                          status: c.status,
                        },
                        {
                          repoRoot: c.projectRootPath,
                          projectRootPath: c.projectRootPath,
                          projectName: c.projectName,
                          changeName: c.name,
                        } satisfies ReferenceContext,
                      )}
                    />
                    {c.taskCount > 0 && (
                      <div className="w-24">
                        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>Tasks</span>
                          <span className="tabular-nums">{c.doneTasks}/{c.taskCount}</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${taskPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="hidden w-20 text-right text-[11px] text-muted-foreground sm:block">
                      <div className="flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(c.updatedAt)}
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
