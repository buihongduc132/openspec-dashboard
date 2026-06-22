/**
 * Task 2.14 — `POST /api/projects/{id}/changes/{changeId}/delta-specs` (req 02).
 *
 * The propose-via-change flow: a proposed requirement mutation is serialized
 * into a delta-spec Markdown section (ADDED / MODIFIED / REMOVED / RENAMED)
 * and appended to the target change as a `delta_specs` row. Direct mutation
 * of `openspec/specs/*` is never performed here (req 02 §2.3); the dedicated
 * main-spec route rejects direct edits (see
 * `src/app/api/projects/[id]/specs/route.ts`).
 *
 * Request body:
 *   {
 *     "domain":      "<spec domain name>",
 *     "verb":        "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED",
 *     "requirement": { "title": "...", "body": "...",
 *                      "scenarios": [{ title, given, when, then }, ...] }
 *   }
 */
import { NextRequest } from "next/server";
import { db } from "@/db";
import { changes, specDomains, deltaSpecs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  serializeDeltaSection,
  DELTA_VERBS,
  type DeltaVerb,
  type ProposedRequirement,
} from "@/lib/propose-change/delta-serialize";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; changeId: string }>;
  },
): Promise<Response> {
  const { id, changeId } = await params;

  // The change must exist and belong to this project.
  const [change] = await db
    .select()
    .from(changes)
    .where(and(eq(changes.id, changeId), eq(changes.projectId, id)))
    .limit(1);
  if (!change) {
    return Response.json({ error: "Change not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verb = String(body.verb ?? "").toUpperCase();
  if (!DELTA_VERBS.includes(verb as DeltaVerb)) {
    return Response.json(
      { error: `Unknown verb "${body.verb}". Must be one of ${DELTA_VERBS.join(", ")}.` },
      { status: 400 },
    );
  }

  const requirement = (body.requirement ?? {}) as Partial<ProposedRequirement>;
  if (!requirement.title || String(requirement.title).trim().length === 0) {
    return Response.json(
      { error: "requirement.title is required and must be non-empty." },
      { status: 400 },
    );
  }

  const domainName = String(body.domain ?? "").trim();
  if (domainName.length === 0) {
    return Response.json(
      { error: "domain is required (the spec domain to mutate)." },
      { status: 400 },
    );
  }

  // Resolve the spec domain row for this project by name.
  const [domain] = await db
    .select()
    .from(specDomains)
    .where(and(eq(specDomains.projectId, id), eq(specDomains.name, domainName)))
    .limit(1);
  if (!domain) {
    return Response.json({ error: "Spec domain not found" }, { status: 404 });
  }

  const content = serializeDeltaSection(verb as DeltaVerb, {
    title: String(requirement.title).trim(),
    body: String(requirement.body ?? "").trim(),
    scenarios: Array.isArray(requirement.scenarios)
      ? requirement.scenarios.map((s) => ({
          title: String(s.title ?? "").trim(),
          given: String(s.given ?? "").trim(),
          when: String(s.when ?? "").trim(),
          then: String(s.then ?? "").trim(),
        }))
      : [],
  });

  const [created] = await db
    .insert(deltaSpecs)
    .values({
      changeId,
      domainId: domain.id,
      deltaType: verb,
      content,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
