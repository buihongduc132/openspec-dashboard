import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { projects, tasks, changes } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { KanbanSquare, ArrowLeft, Plus, MoreHorizontal, GitBranchPlus, Calendar, User } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const columns = [
  { id: "backlog", label: "Backlog", dotClass: "bg-slate-400" },
  { id: "ready", label: "Ready", dotClass: "bg-blue-500" },
  { id: "in-progress", label: "In Progress", dotClass: "bg-amber-500" },
  { id: "review", label: "Review", dotClass: "bg-purple-500" },
  { id: "done", label: "Done", dotClass: "bg-emerald-500" },
];

function getInitials(name: string) {
  return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}
function avatarGradient(name: string) {
  const palettes = [
    "from-indigo-500 to-blue-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-amber-500 to-orange-500",
    "from-violet-500 to-purple-500",
  ];
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return palettes[hash % palettes.length];
}

export default async function ProjectKanbanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  const projectTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      assignee: tasks.assignee,
      dueDate: tasks.dueDate,
      taskNumber: tasks.taskNumber,
      changeId: tasks.changeId,
      changeName: changes.name,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(changes, eq(tasks.changeId, changes.id))
    .where(eq(tasks.projectId, id))
    .orderBy(desc(tasks.updatedAt));

  const byStatus = columns.reduce<Record<string, typeof projectTasks>>((acc, c) => {
    acc[c.id] = projectTasks.filter((t) => t.status === c.id);
    return acc;
  }, {});

  const priorityColor: Record<string, string> = {
    high: "bg-red-500/10 text-red-500",
    urgent: "bg-red-500/10 text-red-500",
    medium: "bg-amber-500/10 text-amber-600",
    low: "bg-slate-500/10 text-slate-500",
  };

  return (
    <div className="px-6 py-8 lg:px-10">
      <Button variant="ghost" size="sm" asChild className="mb-4 gap-1 px-2 text-muted-foreground">
        <Link href={`/projects/${id}`}><ArrowLeft className="h-3.5 w-3.5" /> {project.name}</Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-2 gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            <KanbanSquare className="h-3 w-3" /> Kanban
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name} · Task Board</h1>
        </div>
        <Button size="sm"><Plus className="h-3.5 w-3.5" /> New Task</Button>
      </div>

      <Separator className="mb-6" />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colTasks = byStatus[col.id] ?? [];
          return (
            <div key={col.id} className="flex w-72 shrink-0 flex-col">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dotClass}`} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="h-5 rounded-sm px-1.5 text-[10px] font-normal tabular-nums">{colTasks.length}</Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-1 flex-col gap-2 rounded-lg bg-muted/30 p-2">
                {colTasks.map((t) => (
                  <Card key={t.id} className="group/card cursor-grab border-border/60 bg-card p-3 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{t.taskNumber}</span>
                        {t.priority && priorityColor[t.priority] && (
                          <span className={`h-1.5 w-1.5 rounded-full ${priorityColor[t.priority].split(" ")[0].replace("bg-", "bg-")}`} />
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground/0 group-hover/card:text-muted-foreground/60">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="mt-1 text-[13px] font-medium leading-snug">{t.title}</p>
                    {t.changeName && (
                      <Badge variant="outline" className="mt-2 gap-1 rounded-sm px-1.5 py-0 font-mono text-[9px] font-normal">
                        <GitBranchPlus className="h-2.5 w-2.5" /> {t.changeName}
                      </Badge>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      {t.assignee ? (
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(t.assignee)} text-[9px] font-bold text-white`} title={t.assignee}>
                          {getInitials(t.assignee)}
                        </div>
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border/80">
                          <User className="h-2.5 w-2.5 text-muted-foreground/60" />
                        </div>
                      )}
                      {t.dueDate && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Calendar className="h-2.5 w-2.5" /> {formatDate(t.dueDate)}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
