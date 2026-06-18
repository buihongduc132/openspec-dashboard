import { db } from "@/db";
import Link from "next/link";
import { tasks, changes, projects } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  KanbanSquare,
  Plus,
  MoreHorizontal,
  GitBranchPlus,
  Calendar,
  User,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

type TaskWithMeta = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  dueDate: Date | null;
  taskNumber: string;
  groupTitle: string | null;
  checked: boolean | null;
  changeName: string | null;
  projectName: string;
  projectId: string;
  changeId: string | null;
  updatedAt: Date;
};

const columns = [
  { id: "backlog", label: "Backlog", color: "bg-slate-400", dotClass: "bg-slate-400" },
  { id: "ready", label: "Ready", color: "bg-blue-500", dotClass: "bg-blue-500" },
  { id: "in-progress", label: "In Progress", color: "bg-amber-500", dotClass: "bg-amber-500" },
  { id: "review", label: "Review", color: "bg-purple-500", dotClass: "bg-purple-500" },
  { id: "done", label: "Done", color: "bg-emerald-500", dotClass: "bg-emerald-500" },
];

const priorityBadge: Record<string, { variant: "slate" | "warning" | "destructive" | "info"; label: string }> = {
  low: { variant: "slate", label: "Low" },
  medium: { variant: "info", label: "Medium" },
  high: { variant: "warning", label: "High" },
  urgent: { variant: "destructive", label: "Urgent" },
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarGradient(name: string) {
  const palettes = [
    "from-indigo-500 to-blue-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-amber-500 to-orange-500",
    "from-violet-500 to-purple-500",
    "from-cyan-500 to-sky-500",
  ];
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palettes[hash % palettes.length];
}

export default async function KanbanPage() {
  // Fetch all tasks with related change + project
  const allTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      assignee: tasks.assignee,
      dueDate: tasks.dueDate,
      taskNumber: tasks.taskNumber,
      groupTitle: tasks.groupTitle,
      checked: tasks.checked,
      changeId: tasks.changeId,
      changeName: changes.name,
      projectId: projects.id,
      projectName: projects.name,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(changes, eq(tasks.changeId, changes.id))
    .orderBy(desc(tasks.updatedAt));

  // Group by status
  const tasksByStatus = columns.reduce<Record<string, TaskWithMeta[]>>((acc, col) => {
    acc[col.id] = allTasks.filter((t) => t.status === col.id) as TaskWithMeta[];
    return acc;
  }, {});

  return (
    <div className="px-6 py-8 lg:px-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <KanbanSquare className="h-3 w-3" /> Kanban
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Task Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All tasks across every project and change. Drag to update status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">Group by: Change</Button>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" /> New Task
          </Button>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colTasks = tasksByStatus[col.id] ?? [];
          return (
            <div key={col.id} className="flex w-80 shrink-0 flex-col">
              {/* Column header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dotClass}`} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="h-5 rounded-sm px-1.5 text-[10px] font-normal tabular-nums">
                    {colTasks.length}
                  </Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {/* Cards */}
              <div className="flex flex-1 flex-col gap-2.5 rounded-lg bg-muted/30 p-2">
                {colTasks.length === 0 ? (
                  <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/80 text-[11px] text-muted-foreground">
                    No tasks
                  </div>
                ) : (
                  colTasks.map((t) => {
                    const prio = priorityBadge[t.priority ?? ""];
                    const isOverdue =
                      t.dueDate && new Date(t.dueDate) < new Date() && col.id !== "done";
                    return (
                      <Card
                        key={t.id}
                        className="group/card cursor-grab border-border/60 bg-card p-3 shadow-sm transition-all hover:border-border hover:shadow-md active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {t.taskNumber}
                            </span>
                            {prio && (
                              <Badge
                                variant={prio.variant as "warning" | "slate"}
                                className="h-4 rounded-sm px-1 text-[9px] font-semibold uppercase"
                              >
                                {prio.label}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full text-muted-foreground/0 transition-colors hover:text-muted-foreground group-hover/card:text-muted-foreground/60"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </div>

                        <Link
                          href={
                            t.changeId
                              ? `/projects/${t.projectId}/changes/${t.changeId}`
                              : `/projects/${t.projectId}`
                          }
                          className="mt-1.5 block text-[13px] font-medium leading-snug hover:text-primary"
                        >
                          {t.title}
                        </Link>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          {t.changeName && (
                            <Badge
                              variant="outline"
                              className="gap-1 rounded-sm px-1.5 py-0 font-mono text-[9px] font-normal"
                            >
                              <GitBranchPlus className="h-2.5 w-2.5" />
                              {t.changeName}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground/80">{t.projectName}</span>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {t.assignee ? (
                              <div className="flex items-center gap-1.5">
                                <div
                                  className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(
                                    t.assignee
                                  )} text-[9px] font-bold text-white`}
                                  title={t.assignee}
                                >
                                  {getInitials(t.assignee)}
                                </div>
                                <span className="text-[10px] text-muted-foreground">{t.assignee.split(" ")[0]}</span>
                              </div>
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border/80">
                                <User className="h-2.5 w-2.5 text-muted-foreground/60" />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {t.dueDate && (
                              <span
                                className={`flex items-center gap-0.5 text-[10px] ${
                                  isOverdue ? "text-red-500" : "text-muted-foreground"
                                }`}
                              >
                                {isOverdue && <AlertCircle className="h-2.5 w-2.5" />}
                                <Calendar className="h-2.5 w-2.5" />
                                {formatDate(t.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
