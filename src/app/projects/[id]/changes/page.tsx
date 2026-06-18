import { db } from "@/db";
import { changes, artifacts, tasks } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const allChanges = await db
    .select()
    .from(changes)
    .where(eq(changes.projectId, id))
    .orderBy(sql`${changes.createdAt} DESC`);

  // Get artifact and task counts for each change
  const changeDetails = await Promise.all(
    allChanges.map(async (c) => {
      const arts = await db
        .select({ type: artifacts.type, status: artifacts.status })
        .from(artifacts)
        .where(eq(artifacts.changeId, c.id));

      const changeTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.changeId, c.id));

      const doneTasks = changeTasks.filter((t) => t.checked);

      const artifactStatus = new Map<string, string>();
      arts.forEach((a) => artifactStatus.set(a.type, a.status));

      return {
        change: c,
        artifactStatus,
        totalTasks: changeTasks.length,
        doneTasks: doneTasks.length,
        progress: changeTasks.length ? Math.round((doneTasks.length / changeTasks.length) * 100) : 0,
      };
    })
  );

  const schemaColors: Record<string, string> = {
    proposed: "bg-blue-100 text-blue-700",
    "in-progress": "bg-amber-100 text-amber-700",
    completed: "bg-emerald-100 text-emerald-700",
    archived: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href={`/projects/${id}`} className="text-slate-400 hover:text-slate-600">←</Link>
            <h1 className="text-3xl font-bold text-slate-900">Changes</h1>
          </div>
          <p className="mt-1 text-slate-500">Proposed modifications and their artifacts</p>
        </div>
        <Link href={`/projects/${id}/changes/new`} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
          + New Change
        </Link>
      </div>

      {allChanges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <span className="text-4xl">🔄</span>
          <p className="mt-4 text-lg text-slate-500">No changes yet.</p>
          <p className="mt-1 text-sm text-slate-400">Create your first change to start planning.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {changeDetails.map(({ change, artifactStatus, totalTasks, doneTasks, progress }) => (
            <Link
              key={change.id}
              href={`/projects/${id}/changes/${change.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-violet-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">{change.name}</h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${schemaColors[change.status] || "bg-slate-100"}`}>
                      {change.status}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {change.schema}
                    </span>
                  </div>
                  {change.description && (
                    <p className="mt-1 text-sm text-slate-500">{change.description}</p>
                  )}

                  {/* Artifact status */}
                  <div className="mt-3 flex gap-2">
                    {["proposal", "specs", "design", "tasks"].map((type) => {
                      const status = artifactStatus.get(type);
                      return (
                        <span
                          key={type}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                            status === "done"
                              ? "bg-emerald-100 text-emerald-700"
                              : status === "ready"
                              ? "bg-blue-100 text-blue-600"
                              : status === "blocked"
                              ? "bg-slate-100 text-slate-400"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {status === "done" ? "✓" : status ? "◷" : "○"} {type}
                        </span>
                      );
                    })}
                  </div>

                  {/* Task progress */}
                  {totalTasks > 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">
                        {doneTasks}/{totalTasks} tasks ({progress}%)
                      </span>
                    </div>
                  )}
                </div>
                <span className="ml-4 text-xs text-slate-400 whitespace-nowrap">
                  {new Date(change.createdAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
