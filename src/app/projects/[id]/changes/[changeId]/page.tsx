import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, count, sql } from "drizzle-orm";
import { projects, changes, artifacts, tasks } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  GitBranchPlus,
  ArrowLeft,
  Lightbulb,
  BookOpen,
  Code2,
  ListChecks,
  CheckCircle2,
  Circle,
  Clock,
  User,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusMeta: Record<string, { label: string; variant: "slate" | "info" | "warning" | "success" }> = {
  proposed: { label: "Proposed", variant: "info" },
  "in-progress": { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  archived: { label: "Archived", variant: "slate" },
};

const artifactConfig = {
  proposal: { label: "Proposal", icon: Lightbulb, color: "text-amber-500" },
  specs: { label: "Spec Deltas", icon: BookOpen, color: "text-blue-500" },
  design: { label: "Design", icon: Code2, color: "text-violet-500" },
  tasks: { label: "Tasks", icon: ListChecks, color: "text-emerald-500" },
} as const;

export default async function ChangeDetailPage({
  params,
}: {
  params: Promise<{ id: string; changeId: string }>;
}) {
  const { id, changeId } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  const [change] = await db.select().from(changes).where(eq(changes.id, changeId)).limit(1);
  if (!change) return notFound();

  const arts = await db.select().from(artifacts).where(eq(artifacts.changeId, changeId));
  const allTasks = await db.select().from(tasks).where(eq(tasks.changeId, changeId));
  const [{ count: doneCount }] = await db
    .select({ count: count() })
    .from(tasks)
    .where(sql`${tasks.changeId} = ${changeId} AND ${tasks.status} = 'done'`);

  const groupedTasks = allTasks.reduce<Record<string, typeof allTasks>>((acc, t) => {
    const key = t.groupTitle ?? "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const meta = statusMeta[change.status] ?? statusMeta.proposed;
  const totalTasks = allTasks.length;
  const progress = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  return (
    <div className="px-6 py-8 lg:px-10">
      <Button variant="ghost" size="sm" asChild className="mb-4 gap-1 px-2 text-muted-foreground">
        <Link href={`/projects/${id}/changes`}>
          <ArrowLeft className="h-3.5 w-3.5" /> All changes
        </Link>
      </Button>

      {/* Header */}
      <Card className="relative mb-6 overflow-hidden border-border/60 bg-gradient-to-br from-violet-500/5 via-transparent to-indigo-500/5 shadow-none">
        <CardHeader className="pb-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <GitBranchPlus className="h-4 w-4 text-violet-500" />
                <span className="font-mono text-sm font-medium">{change.name}</span>
                <Badge variant={meta.variant} className="rounded-sm px-2 py-0.5 text-[10px]">{meta.label}</Badge>
              </div>
              {change.description && (
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{change.description}</p>
              )}
              <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{project.name}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> Created {formatDate(change.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">Verify</Button>
              <Button size="sm">Run Apply</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4 border-t border-border/60 pt-4 text-xs">
            <div>
              <span className="text-muted-foreground">Progress</span>
              <span className="ml-2 font-semibold tabular-nums">{progress}%</span>
            </div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="tabular-nums text-muted-foreground">{doneCount}/{totalTasks} tasks</span>
          </div>
        </CardContent>
      </Card>

      {/* Artifact tabs (we stack them vertically) */}
      <div className="grid gap-5 lg:grid-cols-2">
        {(Object.keys(artifactConfig) as Array<keyof typeof artifactConfig>).map((type) => {
          const config = artifactConfig[type];
          const Icon = config.icon;
          const artifact = arts.find((a) => a.type === type);

          return (
            <Card key={type} className="border-border/60 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  {config.label}
                </CardTitle>
                {artifact ? (
                  <Badge variant={artifact.status === "approved" || artifact.status === "done" ? "success" : "warning"} className="rounded-sm text-[10px]">
                    {artifact.status}
                  </Badge>
                ) : (
                  <Badge variant="slate" className="rounded-sm text-[10px]">missing</Badge>
                )}
              </CardHeader>
              <CardContent>
                {artifact ? (
                  type === "tasks" ? (
                    <div className="space-y-4">
                      {Object.entries(groupedTasks).map(([group, grpTasks]) => (
                        <div key={group}>
                          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group}
                          </h4>
                          <ul className="space-y-1.5">
                            {grpTasks.map((t) => (
                              <li key={t.id} className="flex items-start gap-2 text-xs">
                                {t.status === "done" ? (
                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                ) : (
                                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                                )}
                                <div className="min-w-0">
                                  <span className="font-mono text-[10px] text-muted-foreground">{t.taskNumber}</span>{" "}
                                  <span className={t.status === "done" ? "text-muted-foreground line-through" : ""}>
                                    {t.title}
                                  </span>
                                  {t.assignee && (
                                    <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                      <User className="h-2.5 w-2.5" /> {t.assignee.split(" ")[0]}
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                        {artifact.content}
                      </pre>
                    </div>
                  )
                ) : (
                  <div className="rounded-md border border-dashed border-border/80 bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
                    No {config.label.toLowerCase()} artifact yet.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
