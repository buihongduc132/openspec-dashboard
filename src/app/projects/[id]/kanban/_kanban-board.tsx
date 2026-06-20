"use client";

import { useState, useCallback, useMemo } from "react";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

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

type ChangeMap = Map<string, string>;

const COLUMNS = [
  { id: "backlog", label: "Backlog", color: "bg-slate-200", dotColor: "bg-slate-400" },
  { id: "ready", label: "Ready", color: "bg-blue-200", dotColor: "bg-blue-400" },
  { id: "in-progress", label: "In Progress", color: "bg-amber-200", dotColor: "bg-amber-400" },
  { id: "review", label: "Review", color: "bg-purple-200", dotColor: "bg-purple-400" },
  { id: "done", label: "Done", color: "bg-emerald-200", dotColor: "bg-emerald-400" },
];

const priorityColors: Record<string, string> = {
  low: "text-slate-400",
  medium: "text-blue-500",
  high: "text-amber-500",
  urgent: "text-red-500",
};

const priorityLabels: Record<string, string> = {
  low: "●",
  medium: "●●",
  high: "●●●",
  urgent: "🔴",
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

export default function KanbanBoard({
  initialTasks,
  changeMap,
  projectId,
  projectName,
  projectRootPath,
}: {
  initialTasks: Task[];
  changeMap: ChangeMap;
  projectId: string;
  /** Project name — flows into the task reference metadata (projectName). */
  projectName?: string;
  /**
   * Project rootPath — the filesystem anchor used to resolve the task's
   * absolute path inside the reference payload (design D2/D8).
   */
  projectRootPath?: string;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [filter, setFilter] = useState({ change: "", assignee: "", search: "" });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (e) {
      console.error("Failed to update task status", e);
    }
  }, []);

  const handleDragStart = (taskId: string) => {
    setDragging(taskId);
  };

  const handleDragOver = (columnId: string) => {
    setDragOver(columnId);
  };

  const handleDrop = (columnId: string) => {
    if (dragging) {
      updateTaskStatus(dragging, columnId);
    }
    setDragging(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter.change && t.changeId !== filter.change) return false;
    if (filter.assignee && t.assignee !== filter.assignee) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.taskNumber.includes(q)) return false;
    }
    return true;
  });

  const assignees = tasks.map((t) => t.assignee).filter((a): a is string => Boolean(a));
  const changeIds = [...new Set(tasks.map((t) => t.changeId))];

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input
          type="text"
          placeholder="Search tasks..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filter.change}
          onChange={(e) => setFilter({ ...filter, change: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Changes</option>
          {changeIds.map((cid) => (
            <option key={cid} value={cid}>{changeMap.get(cid)}</option>
          ))}
        </select>
        <select
          value={filter.assignee ?? ""}
          onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Assignees</option>
          {assignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-slate-400">
          {filteredTasks.length} of {tasks.length} tasks
        </span>
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-5 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`kanban-column ${dragOver === col.id ? "drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                handleDragOver(col.id);
              }}
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
                  const labels = safeJson(task.labels);
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                      className={`kanban-card ${dragging === task.id ? "dragging" : ""}`}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-xs text-slate-400">{task.taskNumber}</span>
                        {task.priority && (
                          <span className={`text-xs ${priorityColors[task.priority] || "text-slate-400"}`} title={task.priority}>
                            {priorityLabels[task.priority] || ""}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-800">{task.title}</p>
                      {task.groupTitle && (
                        <p className="mt-1 text-xs text-slate-400">{task.groupTitle}</p>
                      )}
                      {task.assignee && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-700">
                            {task.assignee[0]}
                          </div>
                          <span className="text-xs text-slate-500">{task.assignee}</span>
                        </div>
                      )}
                      {task.changeId && (
                        <div className="mt-2">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {changeMap.get(task.changeId)}
                          </span>
                        </div>
                      )}
                      {labels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {labels.slice(0, 3).map((l: string) => (
                            <span
                              key={l}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${labelColors[l] || "bg-slate-100 text-slate-500"}`}
                            >
                              {l}
                            </span>
                          ))}
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

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          changeName={changeMap.get(selectedTask.changeId) || ""}
          projectName={projectName}
          projectRootPath={projectRootPath}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updates) => {
            setTasks((prev) =>
              prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updates } : t))
            );
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}

function TaskDetailModal({
  task,
  changeName,
  projectName,
  projectRootPath,
  onClose,
  onUpdate,
}: {
  task: Task;
  changeName: string;
  projectName?: string;
  projectRootPath?: string;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editAssignee, setEditAssignee] = useState(task.assignee || "");
  const [editPriority, setEditPriority] = useState(task.priority || "medium");

  // Build the canonical task reference (design D1) from the open task plus
  // the relational context the kanban already holds (changeName + project
  // rootPath + projectName). The project rootPath anchors the absolute path;
  // when absent we fall back to the configured repo-root base so the payload
  // still resolves to a sensible location.
  const reference = useMemo(() => {
    const ctx: ReferenceContext = {
      repoRoot: projectRootPath ?? "",
      projectName,
      projectRootPath,
      changeName,
    };
    return buildEntityReference(
      "task",
      {
        id: task.id,
        taskNumber: task.taskNumber,
        title: task.title,
        status: task.status,
        assignee: task.assignee,
        priority: task.priority,
      },
      ctx,
    );
  }, [task, changeName, projectName, projectRootPath]);

  const handleSave = async () => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, assignee: editAssignee || null, priority: editPriority }),
      });
      onUpdate({ title: editTitle, assignee: editAssignee || null, priority: editPriority });
      setEditing(false);
    } catch (e) {
      console.error("Failed to update task", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="font-mono text-xs text-slate-400">{task.taskNumber}</span>
            {editing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            ) : (
              <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
            )}
            {changeName && (
              <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {changeName}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div className="mb-4">
          <CopyReferenceButton reference={reference} />
        </div>

        {task.description && (
          <p className="mb-4 text-sm text-slate-600">{task.description}</p>
        )}

        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium capitalize">
              {task.status}
            </span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Group</label>
            <p className="text-sm text-slate-700">{task.groupTitle || "—"}</p>
          </div>
        </div>

        {editing ? (
          <div className="mb-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Assignee</label>
              <input
                type="text"
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                placeholder="Unassigned"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Assignee</label>
              {task.assignee ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                    {task.assignee[0]}
                  </div>
                  <span className="text-sm text-slate-700">{task.assignee}</span>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Unassigned</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Priority</label>
              <span className={`text-sm font-medium ${priorityColors[task.priority || "medium"]}`}>
                {task.priority}
              </span>
            </div>
          </div>
        )}

        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ✏️ Edit Task
          </button>
        )}
      </div>
    </div>
  );
}

function safeJson(val: string | null): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}
