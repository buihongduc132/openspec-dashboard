import { db } from "@/db";
import { projects } from "@/db/schema";
import Link from "next/link";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const allProjects = await db.select().from(projects).orderBy(desc(projects.createdAt));

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
          <p className="mt-1 text-slate-500">Manage your OpenSpec projects</p>
        </div>
        <Link href="/projects/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New Project
        </Link>
      </div>

      {allProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <p className="text-4xl mb-4">📁</p>
          <p className="text-lg text-slate-500">No projects yet.</p>
          <p className="text-sm text-slate-400 mt-1">Create your first OpenSpec project to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Root Path</th>
                <th className="px-5 py-3 font-medium">Schema</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {allProjects.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium text-slate-900">{p.name}</td>
                  <td className="px-5 py-4 text-slate-500 max-w-xs truncate">{p.description || "—"}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-400">{p.rootPath}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {p.defaultSchema}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/projects/${p.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
