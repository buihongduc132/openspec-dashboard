import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import SettingsForm from "./_settings-form";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <a href={`/projects/${id}`} className="text-slate-400 hover:text-slate-600">←</a>
          <h1 className="text-3xl font-bold text-slate-900">Project Settings</h1>
        </div>
        <p className="mt-1 text-slate-500">Configure your OpenSpec project</p>
      </div>

      <SettingsForm project={project} />
    </div>
  );
}
