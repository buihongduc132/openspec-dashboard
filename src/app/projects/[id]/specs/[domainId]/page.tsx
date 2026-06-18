import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { projects, specDomains, specs, requirements, scenarios } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, ListChecks, ListTree } from "lucide-react";

export const dynamic = "force-dynamic";

const strengthColor: Record<string, "slate" | "info" | "warning" | "success" | "purple" | "destructive"> = {
  SHALL: "info",
  MUST: "destructive",
  SHOULD: "warning",
  MAY: "slate",
};

export default async function DomainSpecPage({
  params,
}: {
  params: Promise<{ id: string; domainId: string }>;
}) {
  const { id, domainId } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  const [domain] = await db.select().from(specDomains).where(eq(specDomains.id, domainId)).limit(1);
  if (!domain) return notFound();

  const domainSpecs = await db.select().from(specs).where(eq(specs.domainId, domainId));
  const reqs = await db.select().from(requirements).where(
    eq(requirements.specId, domainSpecs[0]?.id ?? "00000000-0000-0000-0000-000000000000")
  );
  const allScenarios = await db
    .select()
    .from(scenarios)
    .where(
      reqs.length > 0
        ? eq(scenarios.requirementId, reqs[0]?.id ?? "00000000-0000-0000-0000-000000000000")
        : eq(scenarios.id, "00000000-0000-0000-0000-000000000000")
    );

  return (
    <div className="px-6 py-8 lg:px-10">
      <Button variant="ghost" size="sm" asChild className="mb-4 gap-1 px-2 text-muted-foreground">
        <Link href={`/projects/${id}/specs`}>
          <ArrowLeft className="h-3.5 w-3.5" /> All domains
        </Link>
      </Button>

      <div className="mb-6">
        <Badge variant="secondary" className="mb-2 gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          <BookOpen className="h-3 w-3" /> {domain.name}
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">{domain.purpose ?? domain.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListTree className="h-4 w-4 text-blue-500" /> Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reqs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No requirements yet.</p>
              ) : (
                reqs.map((r, i) => (
                  <div key={r.id} className="rounded-md border border-border/60 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">RQ-{i + 1}</span>
                      <span className="font-medium text-sm">{r.title}</span>
                      <Badge variant={strengthColor[r.strength ?? "SHALL"] ?? "slate"} className="rounded-sm text-[10px]">
                        {r.strength}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.body}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit border-border/60 shadow-none">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="h-4 w-4 text-emerald-500" /> Scenarios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allScenarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">No scenarios defined.</p>
            ) : (
              allScenarios.map((s) => (
                <div key={s.id} className="rounded-md border border-border/60 p-2.5">
                  <p className="text-xs font-medium">{s.title}</p>
                  <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    <p><span className="font-medium text-foreground/80">GIVEN</span> {s.given}</p>
                    <p><span className="font-medium text-foreground/80">WHEN</span> {s.when}</p>
                    <p><span className="font-medium text-foreground/80">THEN</span> {s.then}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
