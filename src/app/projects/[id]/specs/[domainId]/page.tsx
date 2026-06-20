import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { projects, specDomains, specs, requirements, scenarios } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, ListChecks, ListTree } from "lucide-react";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

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

  // Shared reference context for both the domain and its per-requirement
  // copy controls (design D1 — server builds the canonical reference from
  // already-fetched rows, no extra DB round-trip). The repo-root base
  // defaults to the project rootPath (design D2); the domain name threads
  // through so the path resolver derives `<rootPath>/openspec/specs/<name>`
  // (path-resolution table D8).
  const referenceContext = {
    repoRoot: project.rootPath,
    projectRootPath: project.rootPath,
    projectName: project.name,
    domainName: domain.name,
  } satisfies ReferenceContext;

  return (
    <div className="px-6 py-8 lg:px-10">
      <Button variant="ghost" size="sm" asChild className="mb-4 gap-1 px-2 text-muted-foreground">
        <Link href={`/projects/${id}/specs`}>
          <ArrowLeft className="h-3.5 w-3.5" /> All domains
        </Link>
      </Button>

      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="mb-2 gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <BookOpen className="h-3 w-3" /> {domain.name}
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">{domain.purpose ?? domain.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
          </div>
          {/**
           * Copy reference control for the domain (task 4.4 / spec: Copy
           * affordance on every entity surface). The domain reference is
           * built server-side from the already-fetched domain row + project
           * rootPath (design D1 — no extra DB round-trip). The repo-root
           * base defaults to the project rootPath (design D2) and the
           * domain name is threaded through the context so the path
           * resolver derives `<rootPath>/openspec/specs/<domainName>`
           * (path-resolution table D8).
           */}
          <CopyReferenceButton
            reference={buildEntityReference(
              "spec-domain",
              {
                id: domain.id,
                name: domain.name,
                title: domain.purpose,
              },
              referenceContext,
            )}
          />
        </div>
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">RQ-{i + 1}</span>
                        <span className="font-medium text-sm">{r.title}</span>
                        <Badge variant={strengthColor[r.strength ?? "SHALL"] ?? "slate"} className="rounded-sm text-[10px]">
                          {r.strength}
                        </Badge>
                      </div>
                      {/**
                       * Per-requirement copy reference control (task 4.4 /
                       * spec: Copy affordance on every entity surface). Each
                       * requirement reference is built server-side from the
                       * already-fetched requirement row with the domain name
                       * in context, so the path resolver derives
                       * `<rootPath>/openspec/specs/<domainName>/spec.md` and
                       * the readInstruction points the agent at the
                       * requirement title (design D1, path table D8).
                       */}
                      <CopyReferenceButton
                        reference={buildEntityReference(
                          "requirement",
                          { id: r.id, title: r.title },
                          referenceContext,
                        )}
                      />
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
