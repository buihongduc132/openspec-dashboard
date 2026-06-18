import { db } from "@/db";
import { specDomains, specs, requirements } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SpecsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const domains = await db
    .select()
    .from(specDomains)
    .where(eq(specDomains.projectId, id))
    .orderBy(specDomains.name);

  // Get spec and requirement counts per domain
  const domainStats = await Promise.all(
    domains.map(async (d) => {
      const [specCount] = await db.select({ count: count() }).from(specs).where(eq(specs.domainId, d.id));
      const [reqCount] = await db
        .select({ count: count() })
        .from(requirements)
        .innerJoin(specs, eq(specs.id, requirements.specId))
        .where(eq(specs.domainId, d.id));
      return { domain: d, specs: specCount?.count ?? 0, requirements: reqCount?.count ?? 0 };
    })
  );

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href={`/projects/${id}`} className="text-slate-400 hover:text-slate-600">←</Link>
            <h1 className="text-3xl font-bold text-slate-900">Specs</h1>
          </div>
          <p className="mt-1 text-slate-500">Specification domains and requirements</p>
        </div>
        <Link href={`/projects/${id}/specs/new`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          + New Spec Domain
        </Link>
      </div>

      {domains.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <span className="text-4xl">📖</span>
          <p className="mt-4 text-lg text-slate-500">No spec domains yet.</p>
          <p className="mt-1 text-sm text-slate-400">Create your first spec domain to start documenting system behavior.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {domainStats.map(({ domain, specs: specCount, requirements: reqCount }) => (
            <Link
              key={domain.id}
              href={`/projects/${id}/specs/${domain.id}`}
              className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-lg font-semibold text-slate-900 group-hover:text-emerald-600">
                  {domain.name}
                </h3>
                <span className="text-2xl">📖</span>
              </div>
              {domain.purpose && (
                <p className="mb-4 text-sm text-slate-500">{domain.purpose}</p>
              )}
              <div className="flex gap-4 text-xs text-slate-400">
                <span>{specCount} spec{specCount !== 1 ? "s" : ""}</span>
                <span>{reqCount} requirement{reqCount !== 1 ? "s" : ""}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
