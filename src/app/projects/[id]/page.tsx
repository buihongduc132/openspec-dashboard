import { db } from "@/db";
import {
  projects,
  changes,
  specDomains,
  tasks,
  artifacts,
  schemas,
} from "@/db/schema";
import Link from "next/link";
import { eq, count, sql, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const domains = await db
    .select()
    .from(specDomains)
    .where(eq(specDomains.projectId, id))
    .orderBy(specDomains.name);

  const allChanges = await db
    .select()
    .from(changes)
    .where(eq(changes.projectId, id))
    .orderBy(sql`${changes.createdAt} DESC`);

  const projectTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, id))
    .orderBy(tasks.orderIndex);

  const projectSchemas = await db
    .select()
    .from(schemas)
    .where(eq(schemas.projectId, id))
    .orderBy(schemas.name);

  const taskStats = await db
    .select({ status: tasks.status, count: count() })
    .from(tasks)
    .where(eq(tasks.projectId, id))
    .groupBy(tasks.status);

  const totalTasks = projectTasks.length;
  const doneTasks = taskStats.find((t) => t.status === "done")?.count ?? 0;
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/projects" className="text-slate-400 hover:text-slate-600">←</Link>
            <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
          </div>
          <p className="mt-1 text-slate-500 font-mono text-sm">{project.rootPath}</p>
          {project.description && (
            <p className="mt-2 text-slate-600 max-w-2xl">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${id}/kanban`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            📋 Kanban Board
          </Link>
          <Link href={`/projects/${id}/settings`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ⚙️ Settings
          </Link>
        </div>
      </div>

      {/* Project progress */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Project Progress</h2>
          <span className="text-sm text-slate-500">{progress}% complete</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex gap-6 text-sm text-slate-500">
          <span>{allChanges.length} changes</span>
          <span>{domains.length} spec domains</span>
          <span>{totalTasks} tasks ({doneTasks} done)</span>
          <span>{projectSchemas.length} schemas</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href={`/projects/${id}/specs`} className="rounded-xl border border-slate-200 bg-white p-5 text-center transition-all hover:border-emerald-300 hover:shadow-sm">
          <span className="text-2xl">📖</span>
          <p className="mt-2 text-sm font-medium">Specs</p>
          <p className="text-xs text-slate-400">{domains.length} domains</p>
        </Link>
        <Link href={`/projects/${id}/changes`} className="rounded-xl border border-slate-200 bg-white p-5 text-center transition-all hover:border-violet-300 hover:shadow-sm">
          <span className="text-2xl">🔄</span>
          <p className="mt-2 text-sm font-medium">Changes</p>
          <p className="text-xs text-slate-400">{allChanges.length} total</p>
        </Link>
        <Link href={`/projects/${id}/kanban`} className="rounded-xl border border-slate-200 bg-white p-5 text-center transition-all hover:border-amber-300 hover:shadow-sm">
          <span className="text-2xl">📋</span>
          <p className="mt-2 text-sm font-medium">Kanban</p>
          <p className="text-xs text-slate-400">{totalTasks} tasks</p>
        </Link>
        <Link href={`/projects/${id}/schemas`} className="rounded-xl border border-slate-200 bg-white p-5 text-center transition-all hover:border-blue-300 hover:shadow-sm">
          <span className="text-2xl">🧩</span>
          <p className="mt-2 text-sm font-medium">Schemas</p>
          <p className="text-xs text-slate-400">{projectSchemas.length} schemas</p>
        </Link>
      </div>

      {/* Spec Domains */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Spec Domains</h2>
          <Link href={`/projects/${id}/specs/new`} className="text-sm text-blue-600 hover:underline">+ New Domain</Link>
        </div>
        {domains.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">No spec domains yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {domains.map((d) => (
              <Link
                key={d.id}
                href={`/projects/${id}/specs/${d.id}`}
                className="rounded-lg border border-slate-200 bg-white p-4 transition-all hover:border-emerald-300 hover:shadow-sm"
              >
                <h3 className="font-medium text-slate-900">{d.name}</h3>
                {d.purpose && <p className="mt-1 text-xs text-slate-500">{d.purpose}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Changes */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Changes</h2>
          <Link href={`/projects/${id}/changes/new`} className="text-sm text-blue-600 hover:underline">+ New Change</Link>
        </div>
        {allChanges.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">No changes yet.</p>
        ) : (
          <div className="space-y-3">
            {allChanges.map((c) => {
              const changeTasks = projectTasks.filter((t) => t.changeId === c.id);
              const doneChangeTasks = changeTasks.filter((t) => t.checked);
              const changeProgress = changeTasks.length ? Math.round((doneChangeTasks.length / changeTasks.length) * 100) : 0;

              const statusBadge: Record<string, string> = {
                proposed: "bg-blue-100 text-blue-700",
                "in-progress": "bg-amber-100 text-amber-700",
                completed: "bg-emerald-100 text-emerald-700",
                archived: "bg-slate-100 text-slate-500",
              };

              return (
                <Link
                  key={c.id}
                  href={`/projects/${id}/changes/${c.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 transition-all hover:border-violet-300 hover:shadow-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-slate-900">{c.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[c.status] || "bg-slate-100"}`}>
                        {c.status}
                      </span>
                    </div>
                    {c.description && <p className="mt-1 text-xs text-slate-500">{c.description}</p>}
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${changeProgress}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{doneChangeTasks.length}/{changeTasks.length} tasks</span>
                    </div>
                  </div>
                  <span className="ml-4 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
