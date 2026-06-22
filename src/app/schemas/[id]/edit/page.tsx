/**
 * Task 6.5 — Visual schema editor page (req 05.5 / D-SchemaEditor).
 *
 * Server component: loads the schema row, derives the whole-file ETag, and
 * hands both to the client editor host. The editor performs two-pane two-way
 * binding, live validation, and whole-file If-Match save (INV-7) via
 * PATCH /api/schemas/[id].
 *
 * Source: `openspec/changes/phase3b-integration/specs/schema-visual-editor/spec.md`.
 */
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { schemas } from "@/db/schema";
import { computeSchemaEtag } from "@/lib/schemas/schema-etag";
import SchemaEditorHost from "@/components/schemas/schema-editor-host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function VisualSchemaEditorPage({ params }: PageParams) {
  const { id } = await params;
  const rows = await db.select().from(schemas).where(eq(schemas.id, id)).limit(1);
  const schema = rows[0];
  if (!schema) notFound();

  const etag = computeSchemaEtag(schema.definition);

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 text-muted-foreground"
          >
            <Link href="/schemas">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to schemas
            </Link>
          </Button>
          <Badge variant="secondary" className="mb-1 text-[10px]">
            Visual editor
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit schema — {schema.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Two-pane editor with live validation and two-way binding. Whole-file
            ETag concurrency (INV-7) guards against out-of-band edits.
          </p>
        </div>
      </div>

      <SchemaEditorHost
        schemaId={schema.id}
        initialSource={schema.definition}
        initialIfMatch={etag}
        schemaPath={`schemas/${schema.id}/definition.yaml`}
      />
    </div>
  );
}
