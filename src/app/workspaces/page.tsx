import { db } from "@/db";
import { workspaces, workspaceLinks, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const allWorkspaces = await db.select().from(workspaces).orderBy(workspaces.name);

  const workspaceDetails = await Promise.all(
    allWorkspaces.map(async (ws) => {
      const links = await db
        .select({
          linkName: workspaceLinks.linkName,
          localPath: workspaceLinks.localPath,
          projectName: projects.name,
          projectId: projects.id,
        })
        .from(workspaceLinks)
        .innerJoin(projects, eq(projects.id, workspaceLinks.projectId))
        .where(eq(workspaceLinks.workspaceId, ws.id));
      return { workspace: ws, links };
    })
  );

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Workspaces</h1>
          <p className="mt-1 text-slate-500">Multi-repo coordination workspaces</p>
        </div>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New Workspace
        </button>
      </div>

      {allWorkspaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <span className="text-4xl">🔗</span>
          <p className="mt-4 text-lg text-slate-500">No workspaces yet.</p>
          <p className="mt-1 text-sm text-slate-400">Create a workspace to coordinate across multiple repos.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {workspaceDetails.map(({ workspace, links }) => (
            <div key={workspace.id} className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{workspace.name}</h3>
                  {workspace.opener && (
                    <p className="text-sm text-slate-400">Opener: {workspace.opener}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/*
                   * Icon-only Copy reference control per workspace (task 4.5).
                   * Built from the already-fetched workspace row (design D1).
                   * Workspaces live in the dashboard DB, so the payload path
                   * is a logical `dashboard://` pointer.
                   */}
                  <CopyReferenceButton
                    iconOnly
                    className="h-7 w-7"
                    reference={buildEntityReference(
                      "workspace",
                      { id: workspace.id, name: workspace.name },
                      { repoRoot: "" } satisfies ReferenceContext,
                    )}
                  />
                  <span className="text-sm text-slate-400">{links.length} linked repos</span>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {links.map((link) => (
                  <div key={link.projectId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <Link href={`/projects/${link.projectId}`} className="font-medium text-blue-600 hover:underline">
                      {link.projectName}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-slate-400">{link.localPath}</p>
                    <span className="mt-2 inline-block rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      {link.linkName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
