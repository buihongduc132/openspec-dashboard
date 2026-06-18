import { db } from "@/db";
import { projects, tasks, changes } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import KanbanBoard from "./_kanban-board";

export const dynamic = "force-dynamic";

export default async function ProjectKanbanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const projectTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, id))
    .orderBy(tasks.orderIndex);

  const projectChanges = await db
    .select({ id: changes.id, name: changes.name })
    .from(changes)
    .where(eq(changes.projectId, id));

  const changeMap = new Map(projectChanges.map((c) => [c.id, c.name]));

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <a href={`/projects/${id}`} className="text-slate-400 hover:text-slate-600">←</a>
            <h1 className="text-2xl font-bold text-slate-900">{project.name} — Kanban Board</h1>
          </div>
          <p className="mt-1 text-slate-500 text-sm">
            {projectTasks.length} tasks across {projectChanges.length} changes
          </p>
        </div>
      </div>

      <KanbanBoard
        initialTasks={projectTasks}
        changeMap={changeMap}
        projectId={id}
      />
    </div>
  );
}
