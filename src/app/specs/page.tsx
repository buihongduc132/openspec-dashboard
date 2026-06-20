import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { db } from "@/db";
import { specDomains, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

export const dynamic = "force-dynamic";

export default async function SpecsPage() {
  const domains = await db
    .select({
      id: specDomains.id,
      name: specDomains.name,
      purpose: specDomains.purpose,
      projectId: specDomains.projectId,
      projectName: projects.name,
      projectRootPath: projects.rootPath,
    })
    .from(specDomains)
    .innerJoin(projects, eq(specDomains.projectId, projects.id));

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            <BookOpen className="h-3 w-3" /> Specs
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Specifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Living specification domains and their requirements.
        </p>
      </div>

      <div className="mb-6 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search specs..." className="h-9 pl-9" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {domains.length === 0 ? (
          <Card className="border-dashed border-border/80 bg-muted/30 md:col-span-2 xl:col-span-3">
            <CardContent className="py-14 text-center text-sm text-muted-foreground">
              No spec domains registered.
            </CardContent>
          </Card>
        ) : (
          domains.map((d) => (
            <div key={d.id} className="relative">
              {/* Full-card navigation overlay (z-0) so the icon-only Copy
               * reference control (z-10) stays clickable. */}
              <Link
                href={`/projects/${d.projectId}/specs/${d.id}`}
                className="absolute inset-0 z-0"
                aria-label={d.name}
              />
              <Card className="relative h-full border-border/60 shadow-none transition-all hover:border-border hover:shadow-sm">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-emerald-500" />
                      <CardTitle className="font-mono text-sm">{d.name}</CardTitle>
                    </div>
                    {/*
                     * Icon-only Copy reference control per spec domain (task
                     * 4.5). Built from the already-fetched domain row +
                     * project rootPath (design D1). z-10 keeps it above the
                     * card navigation overlay.
                     */}
                    <CopyReferenceButton
                      iconOnly
                      className="relative z-10 h-7 w-7"
                      reference={buildEntityReference(
                        "spec-domain",
                        { id: d.id, name: d.name },
                        {
                          repoRoot: d.projectRootPath,
                          projectRootPath: d.projectRootPath,
                          projectName: d.projectName,
                          domainName: d.name,
                        } satisfies ReferenceContext,
                      )}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{d.purpose ?? "—"}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{d.projectName}</p>
                </CardContent>
              </Card>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
