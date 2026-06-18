import { db } from "@/db";
import Link from "next/link";
import {
  projects,
  changes,
  specs,
  specDomains,
  tasks,
  schemas,
} from "@/db/schema";
import { sql, count, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

  const stats = await Promise.all(
    allProjects.map(async (p) => {
      const [changeCount] = await db
        .select({ count: count() })
        .from(changes)
        .where(eq(changes.projectId, p.id));

      const activeChanges = await db
        .select({ count: count() })
        .from(changes)
        .where(eq(changes.projectId, p.id) && sql`${changes.status} != 'archived'`);

      const [domainCount] = await db
        .select({ count: count() })
        .from(specDomains)
        .where(eq(specDomains.projectId, p.id));

      const [taskCount] = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.projectId, p.id));

      const doneTasks = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.projectId, p.id) && eq(tasks.status, "done"));

      return {
        project: p,
        changes: changeCount?.count ?? 0,
        activeChanges: activeChanges?.[0]?.count ?? 0,
        domains: domainCount?.count ?? 0,
        tasks: taskCount?.count ?? 0,
        doneTasks: doneTasks?.[0]?.count ?? 0,
        taskProgress: taskCount?.count ? Math.round(((doneTasks?.[0]?.count ?? 0) / taskCount.count) * 100) : 0,
      };
    })
  );

  const totalTasks = stats.reduce((a, b) => a + b.tasks, 0);
  const totalDoneTasks = stats.reduce((a, b) => a + b.doneTasks, 0);
  const totalChanges = stats.reduce((a, b) => a + b.changes, 0);
  const totalDomains = stats.reduce((a, b) => a + b.domains, 0);

  // Recent activity
  const recentChanges = await db
    .select({
      id: changes.id,
      name: changes.name,
      status: changes.status,
      description: changes.description,
      createdAt: changes.createdAt,
      projectName: projects.name,
    })
    .from(changes)
    .innerJoin(projects, eq(changes.projectId, projects.id))
    .orderBy(sql`${changes.createdAt} DESC`)
    .limit(8);

  // Task status breakdown
  const taskBreakdown = await db
    .select({
      status: tasks.status,
      count: count(),
    })
    .from(tasks)
    .groupBy(tasks.status);

  const statusColors: Record<string, string> = {
    backlog: "bg-slate-200 text-slate-700",
    ready: "bg-blue-100 text-blue-700",
    "in-progress": "bg-amber-100 text-amber-700",
    review: "bg-purple-100 text-purple-700",
    done: "bg-emerald-100 text-emerald-700",
  };

  const statusLabels: Record<string, string> = {
    backlog: "Backlog",
    ready: "Ready",
    "in-progress": "In Progress",
    review: "Review",
    done: "Done",
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-500">Overview of all OpenSpec projects</p>
      </div>

      {/* Top-level stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Projects" value={allProjects.length} icon="📁" color="bg-blue-50 border-blue-200" />
        <StatCard label="Changes" value={totalChanges} icon="🔄" color="bg-violet-50 border-violet-200" />
        <StatCard label="Spec Domains" value={totalDomains} icon="📖" color="bg-emerald-50 border-emerald-200" />
        <StatCard label="Tasks" value={`${totalDoneTasks}/${totalTasks}`} icon="✅" color="bg-amber-50 border-amber-200" />
      </div>

      {/* Task status breakdown */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Task Status Breakdown</h2>
        <div className="flex flex-wrap gap-4">
          {taskBreakdown.map((row) => (
            <div key={row.status} className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[row.status] || "bg-slate-100 text-slate-600"}`}>
                {statusLabels[row.status] || row.status}
              </span>
              <span className="text-lg font-bold">{row.count}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          {taskBreakdown.map((row) => {
            const pct = totalTasks ? (row.count / totalTasks) * 100 : 0;
            const barColor: Record<string, string> = {
              backlog: "bg-slate-300",
              ready: "bg-blue-400",
              "in-progress": "bg-amber-400",
              review: "bg-purple-400",
              done: "bg-emerald-400",
            };
            return (
              <div
                key={row.status}
                className={`h-full ${barColor[row.status] || "bg-slate-400"}`}
                style={{ width: `${pct}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Project cards */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Projects</h2>
        {stats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="text-lg text-slate-500">No projects yet. Create your first project to get started.</p>
            <Link href="/projects/new" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Create Project
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stats.map((s) => (
              <Link
                key={s.project.id}
                href={`/projects/${s.project.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600">
                      {s.project.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400 font-mono">{s.project.rootPath}</p>
                  </div>
                  <span className="text-xl">📁</span>
                </div>
                <p className="mb-4 text-sm text-slate-500 line-clamp-2">
                  {s.project.description || "No description"}
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>{s.activeChanges} active changes</span>
                  <span>{s.domains} domains</span>
                  <span>{s.taskProgress}% tasks done</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${s.taskProgress}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent changes */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent Changes</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {recentChanges.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">No changes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-medium">Change</th>
                  <th className="px-5 py-3 font-medium">Project</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentChanges.map((c) => {
                  const statusBadge: Record<string, string> = {
                    proposed: "bg-blue-100 text-blue-700",
                    "in-progress": "bg-amber-100 text-amber-700",
                    completed: "bg-emerald-100 text-emerald-700",
                    archived: "bg-slate-100 text-slate-500",
                  };
                  return (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link href={`/projects/${c.projectName}/changes`} className="font-medium text-blue-600 hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{c.projectName}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[c.status] || "bg-slate-100 text-slate-600"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className={`rounded-xl border p-5 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}
