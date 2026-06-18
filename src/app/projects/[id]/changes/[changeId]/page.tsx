import { db } from "@/db";
import {
  changes,
  artifacts,
  tasks,
  projects,
  specDomains,
  deltaSpecs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";

export const dynamic = "force-dynamic";

export default async function ChangeDetailPage({
  params,
}: {
  params: Promise<{ id: string; changeId: string }>;
}) {
  const { id: projectId, changeId } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) notFound();

  const [change] = await db.select().from(changes).where(eq(changes.id, changeId));
  if (!change) notFound();

  const allArtifacts = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.changeId, changeId))
    .orderBy(artifacts.createdAt);

  const artifactMap = new Map(allArtifacts.map((a) => [a.type, a]));

  const changeTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.changeId, changeId))
    .orderBy(tasks.orderIndex);

  const doneTasks = changeTasks.filter((t) => t.checked);
  const progress = changeTasks.length ? Math.round((doneTasks.length / changeTasks.length) * 100) : 0;

  const deltaSpecDetails = await db
    .select({
      deltaType: deltaSpecs.deltaType,
      content: deltaSpecs.content,
      domainName: specDomains.name,
    })
    .from(deltaSpecs)
    .innerJoin(specDomains, eq(specDomains.id, deltaSpecs.domainId))
    .where(eq(deltaSpecs.changeId, changeId));

  const artifactOrder = ["proposal", "specs", "design", "tasks"];
  const artifactLabels: Record<string, { label: string; icon: string }> = {
    proposal: { label: "Proposal", icon: "📝" },
    specs: { label: "Delta Specs", icon: "📋" },
    design: { label: "Design", icon: "🏗️" },
    tasks: { label: "Tasks", icon: "☑️" },
  };

  const statusColors: Record<string, string> = {
    proposed: "bg-blue-100 text-blue-700",
    "in-progress": "bg-amber-100 text-amber-700",
    completed: "bg-emerald-100 text-emerald-700",
    archived: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
        <Link href={`/projects/${projectId}`} className="hover:text-slate-600">{project.name}</Link>
        <span>→</span>
        <Link href={`/projects/${projectId}/changes`} className="hover:text-slate-600">Changes</Link>
        <span>→</span>
        <span className="text-slate-700 font-medium">{change.name}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900">{change.name}</h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${statusColors[change.status]}`}>
            {change.status}
          </span>
        </div>
        {change.description && (
          <p className="mt-2 text-slate-500">{change.description}</p>
        )}
        <div className="mt-3 flex gap-4 text-sm text-slate-400">
          <span>Schema: {change.schema}</span>
          <span>Created: {new Date(change.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Artifact Dependency Graph */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold">Artifact Progress</h2>
        <div className="flex items-center gap-2">
          {artifactOrder.map((type, i) => {
            const art = artifactMap.get(type);
            const label = artifactLabels[type];
            const isDone = art?.status === "done";
            const isReady = art?.status === "ready";
            const isDraft = art?.status === "draft";
            const isBlocked = art?.status === "blocked";

            return (
              <div key={type} className="flex items-center">
                <div
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${
                    isDone
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : isReady
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : isDraft
                      ? "border-slate-300 bg-white text-slate-400"
                      : isBlocked
                      ? "border-slate-200 bg-slate-50 text-slate-400"
                      : "border-slate-200 bg-slate-50 text-slate-300"
                  }`}
                >
                  <span>{isDone ? "✓" : label.icon}</span>
                  <span className="text-sm font-medium">{label.label}</span>
                </div>
                {i < artifactOrder.length - 1 && (
                  <div className={`mx-1 h-0.5 w-6 ${isDone ? "bg-emerald-300" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {doneTasks.length}/{changeTasks.length} tasks complete ({progress}%)
          </p>
        </div>
      </div>

      {/* Delta Specs */}
      {deltaSpecDetails.length > 0 && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 font-semibold text-amber-800">Delta Specs</h2>
          {deltaSpecDetails.map((ds, i) => (
            <div key={i} className="mb-3 rounded-lg bg-white p-3 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                  ds.deltaType === "ADDED" ? "bg-emerald-100 text-emerald-700" :
                  ds.deltaType === "MODIFIED" ? "bg-amber-100 text-amber-700" :
                  ds.deltaType === "REMOVED" ? "bg-red-100 text-red-700" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {ds.deltaType}
                </span>
                <span className="text-sm text-slate-600">in <code className="rounded bg-slate-100 px-1">{ds.domainName}/spec.md</code></span>
              </div>
              <div className="md-content text-sm text-slate-600">
                <ReactMarkdown>{ds.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Artifacts Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {artifactOrder.map((type) => {
          const art = artifactMap.get(type);
          if (!art) return null;
          const label = artifactLabels[type];
          return (
            <div key={type} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span>{label.icon}</span>
                  <h3 className="font-medium text-slate-700">{label.label}</h3>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  art.status === "done" ? "bg-emerald-100 text-emerald-700" :
                  art.status === "ready" ? "bg-blue-100 text-blue-600" :
                  art.status === "draft" ? "bg-slate-100 text-slate-500" :
                  "bg-slate-100 text-slate-400"
                }`}>
                  {art.status}
                </span>
              </div>
              <div className="max-h-96 overflow-auto p-5">
                <div className="md-content text-sm text-slate-700">
                  <ReactMarkdown>{art.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Task List */}
      {changeTasks.length > 0 && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold">Implementation Tasks</h2>
          <div className="space-y-1">
            {changeTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                <span className={`h-4 w-4 shrink-0 rounded border ${task.checked ? "border-emerald-400 bg-emerald-400" : "border-slate-300"}`}>
                  {task.checked && <span className="text-white text-xs">✓</span>}
                </span>
                <span className="font-mono text-xs text-slate-400 w-10">{task.taskNumber}</span>
                <span className={`text-sm ${task.checked ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {task.title}
                </span>
                {task.assignee && (
                  <span className="ml-auto rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{task.assignee}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
