import { db } from "@/db";
import { schemas, schemaArtifacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Built-in schemas
const BUILTIN_SCHEMAS = [
  {
    name: "spec-driven",
    description: "The default spec-driven development workflow: proposal → specs → design → tasks → implement",
    source: "built-in" as const,
    artifacts: [
      { id: "proposal", generates: "proposal.md", requires: [] },
      { id: "specs", generates: "specs/**/*.md", requires: ["proposal"] },
      { id: "design", generates: "design.md", requires: ["proposal"] },
      { id: "tasks", generates: "tasks.md", requires: ["specs", "design"] },
    ],
  },
  {
    name: "research-first",
    description: "Research before proposal, then straight to tasks. Skips detailed specs and design.",
    source: "built-in" as const,
    artifacts: [
      { id: "research", generates: "research.md", requires: [] },
      { id: "proposal", generates: "proposal.md", requires: ["research"] },
      { id: "tasks", generates: "tasks.md", requires: ["proposal"] },
    ],
  },
  {
    name: "rapid",
    description: "Fast iteration with minimal overhead: quick proposal then tasks.",
    source: "built-in" as const,
    artifacts: [
      { id: "proposal", generates: "proposal.md", requires: [] },
      { id: "tasks", generates: "tasks.md", requires: ["proposal"] },
    ],
  },
];

export default async function SchemasPage() {
  const projectSchemas = await db
    .select()
    .from(schemas)
    .orderBy(schemas.name);

  // Get schema artifacts
  const schemaArtifactMap = new Map<string, typeof schemaArtifacts.$inferSelect[]>();
  const allArtifacts = await db.select().from(schemaArtifacts);
  for (const a of allArtifacts) {
    if (!schemaArtifactMap.has(a.schemaId)) schemaArtifactMap.set(a.schemaId, []);
    schemaArtifactMap.get(a.schemaId)!.push(a);
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Schemas</h1>
        <p className="mt-1 text-slate-500">Workflow schemas defining artifact types and dependencies</p>
      </div>

      {/* Built-in Schemas */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Built-in Schemas</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {BUILTIN_SCHEMAS.map((schema) => (
            <div key={schema.name} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{schema.name}</h3>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  built-in
                </span>
              </div>
              <p className="mb-4 text-sm text-slate-500">{schema.description}</p>
              <div className="space-y-2">
                {schema.artifacts.map((art, i) => (
                  <div key={art.id} className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {art.id}
                    </span>
                    {art.requires.length > 0 && (
                      <span className="text-xs text-slate-400">
                        ← {art.requires.join(", ")}
                      </span>
                    )}
                    {i < schema.artifacts.length - 1 && (
                      <div className="h-3 w-px bg-slate-200" />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs text-slate-400">
                {schema.artifacts.map((a, i) => (
                  <span key={a.id} className="flex items-center gap-1">
                    {a.id}
                    {i < schema.artifacts.length - 1 && <span>→</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Project Schemas */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Project Schemas</h2>
          <span className="text-sm text-slate-400">{projectSchemas.length} custom schemas</span>
        </div>
        {projectSchemas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-slate-500">No custom schemas yet.</p>
            <p className="mt-1 text-sm text-slate-400">Create a custom schema from scratch or fork a built-in one.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projectSchemas.map((schema) => {
              const arts = schemaArtifactMap.get(schema.id) ?? [];
              return (
                <div key={schema.id} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{schema.name}</h3>
                    <div className="flex items-center gap-2">
                      {schema.isActive && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Active
                        </span>
                      )}
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        schema.source === "project" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {schema.source}
                      </span>
                    </div>
                  </div>
                  {schema.description && (
                    <p className="mb-3 text-sm text-slate-500">{schema.description}</p>
                  )}
                  <div className="space-y-2">
                    {arts.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)).map((art) => (
                      <div key={art.id} className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {art.artifactId}
                        </span>
                        <span className="text-xs text-slate-400">→ {art.generates}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs text-slate-400">
                    {arts.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)).map((a, i) => (
                      <span key={a.id} className="flex items-center gap-1">
                        {a.artifactId}
                        {i < arts.length - 1 && <span>→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
