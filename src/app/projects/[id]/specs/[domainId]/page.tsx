import { db } from "@/db";
import {
  specDomains,
  specs,
  requirements,
  scenarios,
  projects,
  changes,
  deltaSpecs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";

export const dynamic = "force-dynamic";

export default async function SpecDetailPage({
  params,
}: {
  params: Promise<{ id: string; domainId: string }>;
}) {
  const { id: projectId, domainId } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) notFound();

  const [domain] = await db
    .select()
    .from(specDomains)
    .where(eq(specDomains.id, domainId));
  if (!domain) notFound();

  const [spec] = await db.select().from(specs).where(eq(specs.domainId, domainId));

  const reqs = await db
    .select()
    .from(requirements)
    .where(eq(requirements.specId, spec?.id ?? ""))
    .orderBy(requirements.orderIndex);

  const allScenarios = await db
    .select()
    .from(scenarios)
    .orderBy(scenarios.orderIndex);

  const scenarioMap = new Map<string, typeof allScenarios>();
  for (const s of allScenarios) {
    if (!scenarioMap.has(s.requirementId)) scenarioMap.set(s.requirementId, []);
    scenarioMap.get(s.requirementId)!.push(s);
  }

  // Find active changes that have delta specs for this domain
  const activeDeltaChanges = await db
    .select({
      changeId: changes.id,
      changeName: changes.name,
      deltaType: deltaSpecs.deltaType,
      deltaContent: deltaSpecs.content,
    })
    .from(deltaSpecs)
    .innerJoin(changes, eq(changes.id, deltaSpecs.changeId))
    .where(
      eq(deltaSpecs.domainId, domainId) && eq(changes.status, "in-progress")
    );

  const strengthColors: Record<string, string> = {
    SHALL: "bg-blue-100 text-blue-700",
    MUST: "bg-red-100 text-red-700",
    SHOULD: "bg-amber-100 text-amber-700",
    MAY: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
        <Link href={`/projects/${projectId}`} className="hover:text-slate-600">{project.name}</Link>
        <span>→</span>
        <Link href={`/projects/${projectId}/specs`} className="hover:text-slate-600">Specs</Link>
        <span>→</span>
        <span className="text-slate-700 font-medium">{domain.name}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 capitalize">{domain.name} Specification</h1>
        {domain.purpose && (
          <p className="mt-2 text-slate-500">{domain.purpose}</p>
        )}
      </div>

      {/* Active Delta Changes */}
      {activeDeltaChanges.length > 0 && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 font-semibold text-amber-800">⚡ Active Delta Specs</h2>
          <div className="space-y-3">
            {activeDeltaChanges.map((dc, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                    dc.deltaType === "ADDED" ? "bg-emerald-100 text-emerald-700" :
                    dc.deltaType === "MODIFIED" ? "bg-amber-100 text-amber-700" :
                    dc.deltaType === "REMOVED" ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {dc.deltaType}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{dc.changeName}</span>
                </div>
                <div className="md-content text-sm text-slate-600">
                  <ReactMarkdown>{dc.deltaContent}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spec Content */}
      {spec && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-slate-700">Spec Content</h2>
          <div className="md-content text-slate-700">
            <ReactMarkdown>{spec.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Requirements */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          Requirements ({reqs.length})
        </h2>
        {reqs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">
            No requirements defined yet.
          </p>
        ) : (
          <div className="space-y-6">
            {reqs.map((req, idx) => {
              const reqScenarios = scenarioMap.get(req.id) ?? [];
              return (
                <div key={req.id} className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{req.title}</h3>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${strengthColors[req.strength ?? ""] || "bg-slate-100"}`}>
                          {req.strength}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{req.body}</p>
                    </div>
                  </div>

                  {reqScenarios.length > 0 && (
                    <div className="mt-4 ml-10 space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Scenarios
                      </h4>
                      {reqScenarios.map((sc) => (
                        <div key={sc.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                          <p className="font-medium text-slate-700">{sc.title}</p>
                          <div className="mt-2 space-y-1 text-slate-500">
                            <p><span className="font-medium text-slate-600">GIVEN</span> {sc.given}</p>
                            <p><span className="font-medium text-slate-600">WHEN</span> {sc.when}</p>
                            <p><span className="font-medium text-slate-600">THEN</span> {sc.then}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
