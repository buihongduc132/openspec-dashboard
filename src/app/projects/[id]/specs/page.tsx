import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { projects, specDomains } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BookOpen, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectSpecsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  const domains = await db.select().from(specDomains).where(eq(specDomains.projectId, id));

  return (
    <div className="px-6 py-8 lg:px-10">
      <Button variant="ghost" size="sm" asChild className="mb-4 gap-1 px-2 text-muted-foreground">
        <Link href={`/projects/${id}`}><ArrowLeft className="h-3.5 w-3.5" /> {project.name}</Link>
      </Button>

      <div className="mb-6">
        <Badge variant="secondary" className="mb-2 gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          <BookOpen className="h-3 w-3" /> Specs
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">Specifications · {project.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consolidated spec domains for this project.</p>
      </div>
      <Separator className="mb-6" />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {domains.length === 0 ? (
          <Card className="border-dashed border-border/80 bg-muted/30 md:col-span-2 xl:col-span-3">
            <CardContent className="py-14 text-center text-sm text-muted-foreground">
              No spec domains yet. Create a change to add requirements.
            </CardContent>
          </Card>
        ) : (
          domains.map((d) => (
            <Card key={d.id} className="border-border/60 shadow-none transition-all hover:border-border hover:shadow-sm">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 font-mono text-sm">
                  <BookOpen className="h-4 w-4 text-emerald-500" /> {d.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{d.purpose ?? "—"}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
