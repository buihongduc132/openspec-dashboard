import { db } from "@/db";
import Link from "next/link";
import {
  projects,
  changes,
  specDomains,
  tasks,
  artifacts,
} from "@/db/schema";
import { count, eq, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  FolderKanban,
  GitBranchPlus,
  BookOpen,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  Clock,
  CheckSquare,
  Activity,
  FileText,
  Lightbulb,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusMeta: Record<string, { label: string; variant: "slate" | "info" | "warning" | "success" | "purple" }> = {
  proposed: { label: "Proposed", variant: "info" },
  "in-progress": { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  archived: { label: "Archived", variant: "slate" },
};

const taskStatusMeta: Record<string, { label: string; color: string; dot: string }> = {
  backlog: { label: "Backlog", color: "text-slate-500 dark:text-slate-400", dot: "bg-slate-400" },
  ready: { label: "Ready", color: "text-blue-500", dot: "bg-blue-500" },
  "in-progress": { label: "In Progress", color: "text-amber-500", dot: "bg-amber-500" },
  review: { label: "Review", color: "text-purple-500", dot: "bg-purple-500" },
  done: { label: "Done", color: "text-emerald-500", dot: "bg-emerald-500" },
};

const priorityMeta: Record<string, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-slate-400",
};

export default async function DashboardPage() {
  // ── Aggregate project stats ────────────────────────────────────────────
  const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

  const projectStats = await Promise.all(
    allProjects.map(async (p) => {
      const [{ count: changeCount }] = await db
        .select({ count: count() })
        .from(changes)
        .where(eq(changes.projectId, p.id));

      const activeChangesList = await db
        .select({ id: changes.id })
        .from(changes)
        .where(
          sql`${changes.projectId} = ${p.id} AND ${changes.status} IN ('proposed', 'in-progress')`
        );

      const [{ count: domainCount }] = await db
        .select({ count: count() })
        .from(specDomains)
        .where(eq(specDomains.projectId, p.id));

      const [{ count: taskCount }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.projectId, p.id));

      const [{ count: doneTaskCount }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(
          sql`${tasks.projectId} = ${p.id} AND ${tasks.status} = 'done'`
        );

      const progress = taskCount > 0 ? Math.round((doneTaskCount / taskCount) * 100) : 0;

      return {
        project: p,
        changes: changeCount,
        activeChanges: activeChangesList.length,
        domains: domainCount,
        tasksTotal: taskCount,
        tasksDone: doneTaskCount,
        progress,
      };
    })
  );

  // Global totals
  const totalProjects = allProjects.length;
  const totalChanges = projectStats.reduce((a, b) => a + b.changes, 0);
  const totalDomains = projectStats.reduce((a, b) => a + b.domains, 0);
  const totalTasks = projectStats.reduce((a, b) => a + b.tasksTotal, 0);
  const totalDoneTasks = projectStats.reduce((a, b) => a + b.tasksDone, 0);
  const overallProgress = totalTasks > 0 ? Math.round((totalDoneTasks / totalTasks) * 100) : 0;
  const activeChangesCount = projectStats.reduce((a, b) => a + b.activeChanges, 0);

  // Recent changes with project join
  const recentChanges = await db
    .select({
      id: changes.id,
      name: changes.name,
      status: changes.status,
      description: changes.description,
      createdAt: changes.createdAt,
      projectId: changes.projectId,
      projectName: projects.name,
    })
    .from(changes)
    .innerJoin(projects, eq(changes.projectId, projects.id))
    .orderBy(desc(changes.createdAt))
    .limit(6);

  // Task status breakdown
  const taskBreakdown = await db
    .select({ status: tasks.status, count: count() })
    .from(tasks)
    .groupBy(tasks.status);

  const breakdownMap = Object.fromEntries(
    taskBreakdown.map((r) => [r.status, Number(r.count)])
  );

  // My / recent tasks (in-progress + upcoming)
  const activeTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      assignee: tasks.assignee,
      dueDate: tasks.dueDate,
      taskNumber: tasks.taskNumber,
      changeName: changes.name,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(changes, eq(tasks.changeId, changes.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(sql`${tasks.status} NOT IN ('done')`)
    .orderBy(desc(tasks.createdAt))
    .limit(8);

  const statCards = [
    { label: "Projects", value: totalProjects, icon: FolderKanban, accent: "from-blue-500/20 to-blue-500/0", iconClass: "text-blue-500 bg-blue-500/10" },
    { label: "Active Changes", value: activeChangesCount, icon: GitBranchPlus, accent: "from-violet-500/20 to-violet-500/0", iconClass: "text-violet-500 bg-violet-500/10" },
    { label: "Spec Domains", value: totalDomains, icon: BookOpen, accent: "from-emerald-500/20 to-emerald-500/0", iconClass: "text-emerald-500 bg-emerald-500/10" },
    { label: "Tasks Done", value: `${totalDoneTasks}/${totalTasks}`, icon: CheckCircle2, accent: "from-amber-500/20 to-amber-500/0", iconClass: "text-amber-500 bg-amber-500/10" },
  ];

  return (
    <div className="relative">
      {/* Hero section with subtle gradient + grid */}
      <div className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_30%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent dark:from-indigo-500/10" />
        <div className="relative px-6 py-10 lg:px-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                  <Activity className="h-3 w-3" />
                  OpenSpec Dashboard
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Welcome back
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                {totalProjects} project{totalProjects !== 1 ? "s" : ""} connected · {activeChangesCount} active changes ·{" "}
                {totalTasks - totalDoneTasks} tasks pending across all workspaces.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/projects">
                  <FolderKanban className="h-3.5 w-3.5" /> All Projects
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/projects/new">
                  <Plus className="h-3.5 w-3.5" /> New Project
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 lg:px-10">
        {/* ── Stat cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="relative overflow-hidden border-border/60 shadow-none transition-colors hover:border-border">
                <div className={`absolute inset-0 bg-gradient-to-br ${s.accent} pointer-events-none`} />
                <CardContent className="relative p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{s.value}</p>
                    </div>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.iconClass}`}>
                      <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Left: Projects + Task breakdown ─────────────────── */}
          <div className="space-y-6 lg:col-span-2">
            {/* Projects */}
            <Card className="overflow-hidden border-border/60 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-4 pt-5">
                <div>
                  <CardTitle className="text-base font-semibold">Projects</CardTitle>
                  <p className="text-xs text-muted-foreground">Your connected OpenSpec repositories</p>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-xs">
                  <Link href="/projects" className="gap-1">
                    View all <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {projectStats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 border-t border-border/60 px-6 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <FolderKanban className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">No projects yet</p>
                      <p className="text-xs text-muted-foreground">Connect your first OpenSpec repository to get started.</p>
                    </div>
                    <Button size="sm" asChild className="mt-1">
                      <Link href="/projects/new">Create Project</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 border-t border-border/60">
                    {projectStats.map((s) => (
                      <Link
                        key={s.project.id}
                        href={`/projects/${s.project.id}`}
                        className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 text-indigo-500 dark:from-indigo-500/20 dark:to-violet-500/20">
                          <FolderKanban className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium group-hover:text-primary">
                              {s.project.name}
                            </p>
                            <Badge variant="secondary" className="h-4.5 shrink-0 rounded-sm px-1.5 text-[10px] font-normal">
                              {s.activeChanges} active
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {s.project.rootPath}
                          </p>
                        </div>
                        <div className="hidden w-40 shrink-0 sm:block">
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">
                              {s.tasksDone}/{s.tasksTotal} tasks
                            </span>
                            <span className="font-medium">{s.progress}%</span>
                          </div>
                          <Progress
                            value={s.progress}
                            className="h-1.5 bg-muted"
                            indicatorClassName={
                              s.progress === 100
                                ? "bg-emerald-500"
                                : s.progress > 50
                                ? "bg-blue-500"
                                : "bg-amber-500"
                            }
                          />
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Changes */}
            <Card className="overflow-hidden border-border/60 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-4 pt-5">
                <div>
                  <CardTitle className="text-base font-semibold">Recent Changes</CardTitle>
                  <p className="text-xs text-muted-foreground">Latest proposals and work-in-progress</p>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-xs">
                  <Link href="/changes" className="gap-1">
                    All changes <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {recentChanges.length === 0 ? (
                  <div className="border-t border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
                    No changes yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 border-t border-border/60">
                    {recentChanges.map((c) => {
                      const meta = statusMeta[c.status] ?? statusMeta.proposed;
                      return (
                        <Link
                          key={c.id}
                          href={`/projects/${c.projectId}/changes/${c.id}`}
                          className="flex items-start gap-4 px-6 py-3.5 transition-colors hover:bg-muted/40"
                        >
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                            <GitBranchPlus className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-mono text-sm font-medium">
                                {c.name}
                              </p>
                              <Badge variant={meta.variant} className="h-4.5 shrink-0 rounded-sm px-1.5 text-[10px] font-normal">
                                {meta.label}
                              </Badge>
                            </div>
                            {c.description && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {c.description}
                              </p>
                            )}
                          </div>
                          <div className="hidden flex-col items-end gap-0.5 sm:flex">
                            <span className="text-[11px] text-muted-foreground">{c.projectName}</span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-2.5 w-2.5" />
                              {timeAgo(c.createdAt)}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Progress ring + Task breakdown + My Tasks ── */}
          <div className="space-y-6">
            {/* Overall progress card */}
            <Card className="relative overflow-hidden border-border/60 shadow-none">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent dark:from-indigo-500/10 pointer-events-none" />
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-sm font-semibold">Overall Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-5">
                  <div className="relative h-20 w-20 shrink-0">
                    <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        fill="none"
                        stroke="hsl(var(--muted))"
                        strokeWidth="5"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="5"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - overallProgress / 100)}`}
                        strokeLinecap="round"
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-semibold">{overallProgress}%</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-2xl font-semibold tracking-tight">
                        {totalDoneTasks}
                        <span className="text-sm font-normal text-muted-foreground"> / {totalTasks}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">tasks completed</p>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" /> On track
                      </span>
                      <span className="text-muted-foreground">{totalTasks - totalDoneTasks} remaining</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Task status breakdown */}
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-sm font-semibold">Task Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(taskStatusMeta).map(([key, meta]) => {
                  const count = breakdownMap[key] ?? 0;
                  const pct = totalTasks > 0 ? (count / totalTasks) * 100 : 0;
                  return (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          <span className="font-medium">{meta.label}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${meta.dot} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* My tasks */}
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <CheckSquare className="h-4 w-4" />
                  Upcoming Tasks
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {activeTasks.length === 0 ? (
                  <div className="px-6 py-6 text-center text-xs text-muted-foreground">
                    All caught up! 🎉
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {activeTasks.slice(0, 5).map((t) => {
                      const statusInfo = taskStatusMeta[t.status] ?? taskStatusMeta.backlog;
                      return (
                        <div key={t.id} className="flex items-start gap-3 px-6 py-3">
                          <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusInfo.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-muted-foreground">{t.taskNumber}</span>
                              <p className="truncate text-xs font-medium leading-tight">{t.title}</p>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                              {t.assignee && <span>{t.assignee}</span>}
                              {t.priority && (
                                <span className={`uppercase ${priorityMeta[t.priority] ?? ""}`}>
                                  {t.priority}
                                </span>
                              )}
                              <span className="truncate">{t.changeName ?? t.projectName}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-10 flex items-center justify-between rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <span>
              OpenSpec is a spec-driven development workflow. Changes flow through{" "}
              <span className="font-mono text-foreground">proposal → specs → design → tasks → archive</span>.
            </span>
          </div>
          <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
            <FileText className="mr-1 h-3 w-3" /> Phase 0 MVP
          </Badge>
        </div>
      </div>
    </div>
  );
}
