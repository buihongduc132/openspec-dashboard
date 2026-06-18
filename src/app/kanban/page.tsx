import { db } from "@/db";
import { tasks, projects, changes } from "@/db/schema";
import { eq } from "drizzle-orm";
import KanbanBoard from "./_global-kanban";

export const dynamic = "force-dynamic";

export default async function GlobalKanbanPage() {
  const allTasks = await db
    .select()
    .from(tasks)
    .orderBy(tasks.orderIndex);

  const projectMap = new Map<string, string>();
  const allProjects = await db.select().from(projects);
  for (const p of allProjects) {
    projectMap.set(p.id, p.name);
  }

  const changeMap = new Map<string, string>();
  const allChanges = await db.select().from(changes);
  for (const c of allChanges) {
    changeMap.set(c.id, c.name);
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Global Kanban Board</h1>
        <p className="mt-1 text-slate-500 text-sm">
          All tasks across all projects
        </p>
      </div>

      <KanbanBoard
        initialTasks={allTasks}
        changeMap={changeMap}
        projectMap={projectMap}
      />
    </div>
  );
}
