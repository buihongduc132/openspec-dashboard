/**
 * Task 6.5 — Schema save endpoint with whole-file If-Match concurrency (INV-7)
 * + validation-before-write (INV-6).
 *
 * PATCH /api/schemas/[id]
 *   Headers: If-Match: <whole-file ETag captured at load>
 *   Body:    { body: <new schema.yaml text> }
 *
 *   - 200 { etag }  — saved; returns the new whole-file ETag.
 *   - 409            — stale If-Match (file changed out-of-band); client offers
 *                      the reload/merge UI.
 *   - 422            — validation errors (save blocked, INV-6).
 *   - 404            — unknown schema id.
 *
 * Source: `openspec/changes/phase3b-integration/specs/schema-visual-editor/spec.md`.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schemas } from "@/db/schema";
import { computeSchemaEtag } from "@/lib/schemas/schema-etag";
import { validateSchema } from "@/lib/schemas/validate";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const rows = await db.select().from(schemas).where(eq(schemas.id, id)).limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ifMatch = req.headers.get("if-match") ?? "";
  const currentEtag = computeSchemaEtag(row.definition);

  // Whole-file optimistic concurrency (INV-7): stale If-Match -> 409.
  if (!ifMatch || ifMatch !== currentEtag) {
    return NextResponse.json(
      { error: "conflict", etag: currentEtag },
      { status: 409 },
    );
  }

  let body: string;
  try {
    const json = (await req.json()) as { body?: string };
    if (typeof json.body !== "string" || json.body.length === 0) {
      return NextResponse.json({ error: "missing or invalid body" }, { status: 400 });
    }
    body = json.body;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Validation before write (INV-6): reject on any error-severity finding.
  const findings = validateSchema(body);
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    return NextResponse.json(
      { error: "validation", findings: errors },
      { status: 422 },
    );
  }

  const [updated] = await db
    .update(schemas)
    .set({ definition: body, updatedAt: new Date() })
    .where(and(eq(schemas.id, id), eq(schemas.definition, row.definition)))
    .returning();

  if (!updated) {
    const freshEtag = computeSchemaEtag(row.definition);
    return NextResponse.json(
      { error: "conflict", etag: freshEtag },
      { status: 409 },
    );
  }

  const etag = computeSchemaEtag(body);
  return NextResponse.json({ ok: true, etag });
}
