import { db } from "@/db";
import Link from "next/link";
import { projects, changes, specDomains, tasks } from "@/db/schema";
import { count, eq, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  FolderKanban,
  Plus,
  Search,
  GitBranchPlus,
  BookOpen,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  ArrowUpRight,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

  const projectsWithStats = await Promise.all(
    allProjects.map(async (p) => {
      const [{ count: changeCount }] = await db
        .select({ count: count() })
        .from(changes)
        .where(eq(changes.projectId, p.id));

      const activeChanges = await db
        .select({ id: changes.id, name: changes.name, status: changes.status })
        .from(changes)
        .where(
          sql`${changes.projectId} = ${p.id} AND ${changes.status} IN ('proposed','in-progress')`
        );

      const [{ count: domainCount }] = await db
        .select({ count: count() })
        .from(specDomains)
        .where(eq(specDomains.projectId, p.id));

      const [{ count: taskCount }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.projectId, p.id));

      const [{ count: doneCount }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(sql`${tasks.projectId} = ${p.id} AND ${tasks.status} = 'done'`);

      return {
        project: p,
        changes: changeCount,
        activeChanges,
        domains: domainCount,
        tasksTotal: taskCount,
        tasksDone: doneCount,
        progress: taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0,
      };
    })
  );

  const totalChanges = projectsWithStats.reduce((a, b) => a + b.changes, 0);
  const totalActive = projectsWithStats.reduce((a, b) => a + b.activeChanges.length, 0);

  return (
    <div className="px-6 py-8 lg:px-10">
      {/* Page header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <FolderKanban className="h-3 w-3" /> Projects
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">All Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {allProjects.length} registered · {totalChanges} total changes · {totalActive} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" asChild>
            <Link href="/projects/new">
              <Plus className="h-3.5 w-3.5" /> New Project
            </Link>
          </Button>
        </div>
      </div>

      {/* Search + filters (decorative) */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search projects..." className="h-9 pl-9" />
        </div>
        <Badge variant="outline" className="rounded-sm gap-1 font-mono text-xs">
          {allProjects.length} total
        </Badge>
      </div>

      <Separator className="mb-6" />

      {/* Projects grid */}
      {projectsWithStats.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-muted/30 shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FolderKanban className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium">No projects yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Register a local folder or clone a repository to begin managing specs and changes.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/projects/new">
                <Plus className="h-3.5 w-3.5" /> Create your first project
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projectsWithStats.map((s) => (
            <Card
              key={s.project.id}
              className="group relative flex flex-col overflow-hidden border-border/60 shadow-none transition-all hover:border-border hover:shadow-sm"
            >
              <Link
                href={`/projects/${s.project.id}`}
                className="absolute inset-0 z-0"
                aria-label={s.project.name}
              />
              <CardHeader className="pb-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 text-indigo-500 dark:from-indigo-500/20 dark:to-violet-500/20">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-sm font-semibold group-hover:text-primary">
                        {s.project.name}
                      </CardTitle>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                        {s.project.rootPath}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative z-10 h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {s.project.description ?? "No description provided."}
                </p>

                <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
                  <div className="flex flex-col items-center gap-0.5 border-r border-border/60 pr-2 last:border-0 last:pr-0">
                    <div className="flex items-center gap-1">
                      <GitBranchPlus className="h-3 w-3 text-violet-500" />
                      <span className="text-sm font-semibold tabular-nums">{s.changes}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Changes</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 border-r border-border/60 pr-2 last:border-0 last:pr-0">
                    <div className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3 text-emerald-500" />
                      <span className="text-sm font-semibold tabular-nums">{s.domains}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Domains</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-amber-500" />
                      <span className="text-sm font-semibold tabular-nums">{s.tasksDone}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Done</span>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Updated {timeAgo(s.project.updatedAt)}
                    </span>
                    <span className="font-medium tabular-nums">{s.progress}%</span>
                  </div>
                  <Progress
                    value={s.progress}
                    className="h-1.5 bg-muted"
                    indicatorClassName={
                      s.progress === 100 ? "bg-emerald-500" : s.progress > 50 ? "bg-blue-500" : "bg-amber-500"
                    }
                  />
                </div>

                {s.activeChanges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.activeChanges.slice(0, 3).map((c) => (
                      <Badge
                        key={c.id}
                        variant={c.status === "in-progress" ? "warning" : "info"}
                        className="gap-1 rounded-sm px-1.5 py-0 text-[10px] font-normal"
                      >
                        <GitBranchPlus className="h-2.5 w-2.5" />
                        {c.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
              <div className="flex items-center justify-between border-t border-border/60 px-6 py-2.5 text-[11px] text-muted-foreground">
                <span className="font-mono">{s.project.defaultSchema}</span>
                <span className="flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open <ArrowUpRight className="h-3 w-3" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
