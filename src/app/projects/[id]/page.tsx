import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, count, sql, desc } from "drizzle-orm";
import { projects, changes, specDomains, tasks, artifacts } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  FolderKanban,
  GitBranchPlus,
  BookOpen,
  CheckCircle2,
  Settings,
  Clock,
  FileText,
  Code2,
  ListChecks,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

const statusMeta: Record<string, { label: string; variant: "slate" | "info" | "warning" | "success" | "purple" }> = {
  proposed: { label: "Proposed", variant: "info" },
  "in-progress": { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  archived: { label: "Archived", variant: "slate" },
};

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  const [{ count: changeCount }] = await db
    .select({ count: count() })
    .from(changes)
    .where(eq(changes.projectId, id));

  const [{ count: domainCount }] = await db
    .select({ count: count() })
    .from(specDomains)
    .where(eq(specDomains.projectId, id));

  const [{ count: taskCount }] = await db
    .select({ count: count() })
    .from(tasks)
    .where(eq(tasks.projectId, id));

  const [{ count: doneTasks }] = await db
    .select({ count: count() })
    .from(tasks)
    .where(sql`${tasks.projectId} = ${id} AND ${tasks.status} = 'done'`);

  const projectChanges = await db
    .select({
      id: changes.id,
      name: changes.name,
      status: changes.status,
      description: changes.description,
      updatedAt: changes.updatedAt,
    })
    .from(changes)
    .where(eq(changes.projectId, id))
    .orderBy(desc(changes.updatedAt))
    .limit(6);

  const changesWithStats = await Promise.all(
    projectChanges.map(async (c) => {
      const [{ count: tc }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.changeId, c.id));
      const [{ count: dc }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(sql`${tasks.changeId} = ${c.id} AND ${tasks.status} = 'done'`);
      const artifactList = await db
        .select({ type: artifacts.type, status: artifacts.status })
        .from(artifacts)
        .where(eq(artifacts.changeId, c.id));
      return { ...c, taskCount: tc, doneTasks: dc, artifacts: artifactList };
    })
  );

  const domains = await db
    .select()
    .from(specDomains)
    .where(eq(specDomains.projectId, id));

  const progress = taskCount > 0 ? Math.round((doneTasks / taskCount) * 100) : 0;

  const tabs = [
    { label: "Overview", href: `/projects/${id}`, icon: FolderKanban, active: true },
    { label: "Changes", href: `/projects/${id}/changes`, icon: GitBranchPlus },
    { label: "Specs", href: `/projects/${id}/specs`, icon: BookOpen },
    { label: "Kanban", href: `/projects/${id}/kanban`, icon: CheckCircle2 },
    { label: "Settings", href: `/projects/${id}/settings`, icon: Settings },
  ];

  return (
    <div className="px-6 py-8 lg:px-10">
      {/* Project header */}
      <Card className="relative mb-6 overflow-hidden border-border/60 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5 shadow-none dark:from-indigo-500/10">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_80%_60%_at_0%_0%,#000_30%,transparent_100%)]" />
        <CardHeader className="relative pb-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/20">
                <FolderKanban className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {project.defaultSchema}
                  </Badge>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{project.rootPath}</p>
                {project.description && (
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/*
                * Copy reference control (task 4.2 / spec: Copy affordance on
                * every entity surface). The project row is already fetched
                * above; the reference payload is built server-side (design D1)
                * and handed to the client control so there is no extra DB
                * round-trip. The repo-root base defaults to the project
                * rootPath (design D2).
                */}
              <CopyReferenceButton
                reference={buildEntityReference(
                  "project",
                  {
                    id: project.id,
                    name: project.name,
                    rootPath: project.rootPath,
                  },
                  {
                    repoRoot: project.rootPath,
                    projectRootPath: project.rootPath,
                    projectName: project.name,
                  } satisfies ReferenceContext,
                )}
              />
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${id}/kanban`}>Kanban</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={`/projects/${id}/changes`}>
                  <GitBranchPlus className="h-3.5 w-3.5" /> View Changes
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          {/* Tab strip */}
          <div className="mt-2 flex flex-wrap gap-1 border-b border-border/60">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    t.active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-border/60 py-3 shadow-none">
              <CardContent className="px-4">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <GitBranchPlus className="h-3 w-3 text-violet-500" /> Changes
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{changeCount}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 py-3 shadow-none">
              <CardContent className="px-4">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <BookOpen className="h-3 w-3 text-emerald-500" /> Domains
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{domainCount}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 py-3 shadow-none">
              <CardContent className="px-4">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <ListChecks className="h-3 w-3 text-amber-500" /> Tasks
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{taskCount}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 py-3 shadow-none">
              <CardContent className="px-4">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-blue-500" /> Done
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{doneTasks}</p>
              </CardContent>
            </Card>
          </div>

          {/* Changes list */}
          <Card className="overflow-hidden border-border/60 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-3 pt-5">
              <CardTitle className="text-sm font-semibold">Recent Changes</CardTitle>
              <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                <Link href={`/projects/${id}/changes`} className="gap-1">
                  All <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {changesWithStats.length === 0 ? (
                <div className="border-t border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
                  No changes yet.
                </div>
              ) : (
                <div className="divide-y divide-border/60 border-t border-border/60">
                  {changesWithStats.map((c) => {
                    const meta = statusMeta[c.status] ?? statusMeta.proposed;
                    const pct = c.taskCount > 0 ? Math.round((c.doneTasks / c.taskCount) * 100) : 0;
                    return (
                      <Link
                        key={c.id}
                        href={`/projects/${id}/changes/${c.id}`}
                        className="group flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-violet-500 transition-colors group-hover:bg-violet-500/10">
                          <GitBranchPlus className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-mono text-sm font-medium">{c.name}</span>
                            <Badge variant={meta.variant} className="h-4.5 shrink-0 rounded-sm px-1.5 text-[10px] font-normal">
                              {meta.label}
                            </Badge>
                          </div>
                          {c.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.description}</p>
                          )}
                        </div>
                        {c.taskCount > 0 && (
                          <div className="hidden w-28 sm:block">
                            <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
                              <span>{c.doneTasks}/{c.taskCount}</span>
                              <span className="tabular-nums">{pct}%</span>
                            </div>
                            <Progress
                              value={pct}
                              className="h-1 bg-muted"
                              indicatorClassName={pct === 100 ? "bg-emerald-500" : "bg-violet-500"}
                            />
                          </div>
                        )}
                        <Clock className="hidden h-3 w-3 text-muted-foreground sm:block" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Progress */}
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2 pt-5">
              <CardTitle className="text-sm font-semibold">Task Completion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{progress}%</span>
                <span className="text-xs text-muted-foreground">
                  {doneTasks} of {taskCount} done
                </span>
              </div>
              <Progress
                value={progress}
                className="h-2 bg-muted"
                indicatorClassName={progress === 100 ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-violet-500"}
              />
            </CardContent>
          </Card>

          {/* Context */}
          {project.context && (
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-2 pt-5">
                <CardTitle className="text-sm font-semibold">Project Context</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {project.context}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Domains */}
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2 pt-5">
              <CardTitle className="text-sm font-semibold">Spec Domains</CardTitle>
            </CardHeader>
            <CardContent>
              {domains.length === 0 ? (
                <p className="text-xs text-muted-foreground">No spec domains yet.</p>
              ) : (
                <div className="space-y-2">
                  {domains.map((d) => (
                    <div key={d.id} className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40">
                      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{d.name}</p>
                        {d.purpose && (
                          <p className="text-[11px] text-muted-foreground">{d.purpose}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
