import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Blocks, Plus, Check } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { schemas } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function SchemasPage() {
  const all = await db.select().from(schemas);

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <Blocks className="h-3 w-3" /> Schemas
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Schemas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Artifact flow templates that define how a change progresses.
          </p>
        </div>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" /> New Schema
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {all.map((s) => (
          <Card key={s.id} className="border-border/60 shadow-none transition-colors hover:border-border">
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Blocks className="h-4 w-4 text-violet-500" />
                    {s.name}
                  </CardTitle>
                  {s.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                  )}
                </div>
                {s.isActive && (
                  <Badge variant="success" className="gap-1 rounded-sm text-[10px]">
                    <Check className="h-3 w-3" /> Active
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary" className="text-[10px] capitalize">{s.source}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Note:</span> The visual schema editor is scheduled for Phase 3. For now, schemas are predefined templates.
      </div>
    </div>
  );
}
