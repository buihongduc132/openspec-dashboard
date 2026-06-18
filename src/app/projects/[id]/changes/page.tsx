import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc, count, sql } from "drizzle-orm";
import { projects, changes, tasks } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { GitBranchPlus, Plus, Clock, ArrowLeft } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusMeta: Record<string, { label: string; variant: "slate" | "info" | "warning" | "success" }> = {
  proposed: { label: "Proposed", variant: "info" },
  "in-progress": { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  archived: { label: "Archived", variant: "slate" },
};

export default async function ProjectChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  const all = await db
    .select()
    .from(changes)
    .where(eq(changes.projectId, id))
    .orderBy(desc(changes.updatedAt));

  const withStats = await Promise.all(
    all.map(async (c) => {
      const [{ count: tc }] = await db.select({ count: count() }).from(tasks).where(eq(tasks.changeId, c.id));
      const [{ count: dc }] = await db
        .select({ count: count() })
        .from(tasks)
        .where(sql`${tasks.changeId} = ${c.id} AND ${tasks.status} = 'done'`);
      return { ...c, taskCount: tc, doneTasks: dc };
    })
  );

  return (
    <div className="px-6 py-8 lg:px-10">
      <Button variant="ghost" size="sm" asChild className="mb-4 gap-1 px-2 text-muted-foreground">
        <Link href={`/projects/${id}`}>
          <ArrowLeft className="h-3.5 w-3.5" /> {project.name}
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-2 gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            <GitBranchPlus className="h-3 w-3" /> Changes
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Changes for {project.name}</h1>
        </div>
        <Button size="sm"><Plus className="h-3.5 w-3.5" /> New Change</Button>
      </div>

      <Separator className="mb-6" />

      <Card className="overflow-hidden border-border/60 shadow-none">
        {withStats.length === 0 ? (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">No changes yet.</CardContent>
        ) : (
          <div className="divide-y divide-border/60">
            {withStats.map((c) => {
              const meta = statusMeta[c.status] ?? statusMeta.proposed;
              return (
                <Link
                  key={c.id}
                  href={`/projects/${id}/changes/${c.id}`}
                  className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/40"
                >
                  <GitBranchPlus className="h-4 w-4 shrink-0 text-violet-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium">{c.name}</span>
                      <Badge variant={meta.variant} className="h-4.5 rounded-sm px-1.5 text-[10px] font-normal">{meta.label}</Badge>
                    </div>
                    {c.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.description}</p>}
                  </div>
                  <span className="hidden text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-1">
                    <Clock className="h-3 w-3" /> {timeAgo(c.updatedAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
