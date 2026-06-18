"use client";

import { useState } from "react";

type Task = {
  id: string;
  changeId: string;
  projectId: string;
  groupTitle: string | null;
  taskNumber: string;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  priority: string | null;
  labels: string | null;
  checked: boolean | null;
  createdAt: Date;
};

const COLUMNS = [
  { id: "backlog", label: "Backlog", dotColor: "bg-slate-400" },
  { id: "ready", label: "Ready", dotColor: "bg-blue-400" },
  { id: "in-progress", label: "In Progress", dotColor: "bg-amber-400" },
  { id: "review", label: "Review", dotColor: "bg-purple-400" },
  { id: "done", label: "Done", dotColor: "bg-emerald-400" },
];

const priorityColors: Record<string, string> = {
  low: "text-slate-400",
  medium: "text-blue-500",
  high: "text-amber-500",
  urgent: "text-red-500",
};

const labelColors: Record<string, string> = {
  frontend: "bg-sky-100 text-sky-700",
  backend: "bg-violet-100 text-violet-700",
  security: "bg-red-100 text-red-700",
  design: "bg-pink-100 text-pink-700",
  bug: "bg-orange-100 text-orange-700",
  testing: "bg-green-100 text-green-700",
  docs: "bg-yellow-100 text-yellow-700",
  refactor: "bg-indigo-100 text-indigo-700",
  styling: "bg-teal-100 text-teal-700",
  component: "bg-cyan-100 text-cyan-700",
  core: "bg-fuchsia-100 text-fuchsia-700",
  accessibility: "bg-lime-100 text-lime-700",
  ui: "bg-rose-100 text-rose-700",
};

export default function GlobalKanbanBoard({
  initialTasks,
  changeMap,
  projectMap,
}: {
  initialTasks: Task[];
  changeMap: Map<string, string>;
  projectMap: Map<string, string>;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [filter, setFilter] = useState({ project: "", search: "" });

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    } catch (e) {
      console.error("Failed to update task", e);
    }
  };

  const handleDragStart = (taskId: string) => setDragging(taskId);
  const handleDragOver = (columnId: string) => setDragOver(columnId);
  const handleDrop = (columnId: string) => {
    if (dragging) updateTaskStatus(dragging, columnId);
    setDragging(null);
    setDragOver(null);
  };
  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
  };

  const projectIds = [...new Set(tasks.map((t) => t.projectId))];
  const filteredTasks = tasks.filter((t) => {
    if (filter.project && t.projectId !== filter.project) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.taskNumber.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input
          type="text"
          placeholder="Search tasks..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filter.project}
          onChange={(e) => setFilter({ ...filter, project: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Projects</option>
          {projectIds.map((pid) => (
            <option key={pid} value={pid}>{projectMap.get(pid)}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-slate-400">
          {filteredTasks.length} of {tasks.length} tasks
        </span>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-5 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`kanban-column rounded-xl border border-slate-200 bg-slate-50/50 p-3 ${dragOver === col.id ? "drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); handleDragOver(col.id); }}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${col.dotColor}`} />
                <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-3">
                {colTasks.map((task) => {
                  const labels = safeParse(task.labels);
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                      className={`kanban-card rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md ${dragging === task.id ? "dragging" : ""}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-xs text-slate-400">{task.taskNumber}</span>
                        {task.priority && (
                          <span className={`text-xs ${priorityColors[task.priority] || "text-slate-400"}`}>
                            {task.priority === "urgent" ? "🔴" : task.priority === "high" ? "●●●" : task.priority === "medium" ? "●●" : "●"}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-800">{task.title}</p>
                      {task.groupTitle && <p className="mt-1 text-xs text-slate-400">{task.groupTitle}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {projectMap.get(task.projectId)}
                        </span>
                        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-500">
                          {changeMap.get(task.changeId)}
                        </span>
                      </div>
                      {labels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {labels.slice(0, 3).map((l: string) => (
                            <span key={l} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${labelColors[l] || "bg-slate-100 text-slate-500"}`}>
                              {l}
                            </span>
                          ))}
                        </div>
                      )}
                      {task.assignee && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-700">
                            {task.assignee[0]}
                          </div>
                          <span className="text-xs text-slate-500">{task.assignee}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function safeParse(val: string | null): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}
