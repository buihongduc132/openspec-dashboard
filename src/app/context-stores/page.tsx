import { db } from "@/db";
import { contextStores, initiatives } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

export const dynamic = "force-dynamic";

export default async function ContextStoresPage() {
  const allStores = await db.select().from(contextStores).orderBy(contextStores.name);

  const storeDetails = await Promise.all(
    allStores.map(async (store) => {
      const storeInitiatives = await db
        .select()
        .from(initiatives)
        .where(eq(initiatives.contextStoreId, store.id))
        .orderBy(initiatives.createdAt);
      return { store, initiatives: storeInitiatives };
    })
  );

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Context Stores</h1>
          <p className="mt-1 text-slate-500">Shared context containers and initiatives</p>
        </div>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New Context Store
        </button>
      </div>

      {allStores.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <span className="text-4xl">🏪</span>
          <p className="mt-4 text-lg text-slate-500">No context stores yet.</p>
          <p className="mt-1 text-sm text-slate-400">Create a context store for shared coordination context.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {storeDetails.map(({ store, initiatives }) => (
            <div key={store.id} className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{store.name}</h3>
                  <p className="text-sm font-mono text-slate-400">{store.path}</p>
                </div>
                <div className="flex items-center gap-3">
                  {/*
                   * Icon-only Copy reference control per context store (task
                   * 4.5). Built from the already-fetched store row (design
                   * D1). Context stores live in the dashboard DB, so the
                   * payload path is a logical `dashboard://` pointer.
                   */}
                  <CopyReferenceButton
                    iconOnly
                    className="h-7 w-7"
                    reference={buildEntityReference(
                      "context-store",
                      { id: store.id, name: store.name, path: store.path },
                      { repoRoot: "" } satisfies ReferenceContext,
                    )}
                  />
                  {store.hasGit && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Git initialized
                    </span>
                  )}
                  <span className="text-sm text-slate-400">{initiatives.length} initiatives</span>
                </div>
              </div>
              {initiatives.length > 0 && (
                <div className="space-y-3">
                  {initiatives.map((init) => (
                    <div key={init.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <h4 className="font-medium text-slate-800">{init.title}</h4>
                      {init.summary && (
                        <p className="mt-1 text-sm text-slate-500">{init.summary}</p>
                      )}
                      <p className="mt-2 text-xs text-slate-400">
                        Created {new Date(init.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
