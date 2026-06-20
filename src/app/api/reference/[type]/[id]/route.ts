/**
 * Reference API endpoint — `/api/reference/{type}/{id}` (design decision D5).
 *
 * A thin read-only resolver: validate `type` against the supported taxonomy
 * (400 with the taxonomy body on miss) → fetch the row via existing Drizzle
 * queries per kind, gathering the relational context needed for path
 * resolution → call {@link buildEntityReference} → return the canonical
 * payload as JSON.
 *
 * This endpoint is the authoritative contract surface for the copy-reference
 * feature and future agent / deep-link integrations. It owns no business
 * logic — all payload shaping lives in `src/lib/entity-reference/`.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  changes,
  tasks,
  specDomains,
  specs,
  requirements,
  schemas,
  contextStores,
  workspaces,
  initiatives,
} from "@/db/schema";
import type { EntityType, ReferenceContext } from "@/lib/entity-reference/types";
import type { BuildRow } from "@/lib/entity-reference/build";
import { buildEntityReference } from "@/lib/entity-reference/build";
import {
  SUPPORTED_REFERENCE_TYPES,
  isSupportedType,
} from "@/lib/entity-reference/supported-types";
import { resolveRepoRoot } from "@/lib/entity-reference/context";

export const dynamic = "force-dynamic";

// Re-export the shared taxonomy + guard so existing import paths (and the
// route-level integration tests) keep working; the canonical definitions
// live in `src/lib/entity-reference/supported-types.ts` (task 2.3).
export { SUPPORTED_REFERENCE_TYPES, isSupportedType };

/**
 * Fetch the row + relational context for the requested entity.
 *
 * @returns `{ row, ctx }` when found, or `null` when no row matches `id`.
 */
async function fetchReference(
  type: EntityType,
  id: string,
): Promise<{ row: BuildRow; ctx: ReferenceContext } | null> {
  switch (type) {
    case "project": {
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      if (!project) return null;
      const ctx: ReferenceContext = {
        repoRoot: resolveRepoRoot(project.rootPath),
        projectName: project.name,
        projectRootPath: project.rootPath,
      };
      return {
        row: {
          id: project.id,
          name: project.name,
          rootPath: project.rootPath,
        },
        ctx,
      };
    }

    case "change": {
      const [change] = await db.select().from(changes).where(eq(changes.id, id));
      if (!change) return null;
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, change.projectId));
      const rootPath = project?.rootPath;
      const ctx: ReferenceContext = {
        repoRoot: resolveRepoRoot(rootPath),
        projectName: project?.name,
        projectRootPath: rootPath,
        changeName: change.name,
      };
      return {
        row: {
          id: change.id,
          name: change.name,
          status: change.status,
        },
        ctx,
      };
    }

    case "task": {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
      if (!task) return null;
      const [change] = await db
        .select()
        .from(changes)
        .where(eq(changes.id, task.changeId));
      const [project] = change
        ? await db.select().from(projects).where(eq(projects.id, change.projectId))
        : [undefined];
      const rootPath = project?.rootPath;
      const ctx: ReferenceContext = {
        repoRoot: resolveRepoRoot(rootPath),
        projectName: project?.name,
        projectRootPath: rootPath,
        changeName: change?.name,
      };
      return {
        row: {
          id: task.id,
          taskNumber: task.taskNumber,
          title: task.title,
          status: task.status,
          assignee: task.assignee,
          priority: task.priority,
          dueDate: task.dueDate
            ? task.dueDate instanceof Date
              ? task.dueDate.toISOString()
              : String(task.dueDate)
            : null,
        },
        ctx,
      };
    }

    case "spec-domain": {
      const [domain] = await db.select().from(specDomains).where(eq(specDomains.id, id));
      if (!domain) return null;
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, domain.projectId));
      const rootPath = project?.rootPath;
      const ctx: ReferenceContext = {
        repoRoot: resolveRepoRoot(rootPath),
        projectName: project?.name,
        projectRootPath: rootPath,
        domainName: domain.name,
      };
      return {
        row: {
          id: domain.id,
          name: domain.name,
        },
        ctx,
      };
    }

    case "spec": {
      const [spec] = await db.select().from(specs).where(eq(specs.id, id));
      if (!spec) return null;
      const [domain] = await db
        .select()
        .from(specDomains)
        .where(eq(specDomains.id, spec.domainId));
      const [project] = domain
        ? await db.select().from(projects).where(eq(projects.id, domain.projectId))
        : [undefined];
      const rootPath = project?.rootPath;
      const ctx: ReferenceContext = {
        repoRoot: resolveRepoRoot(rootPath),
        projectName: project?.name,
        projectRootPath: rootPath,
        domainName: domain?.name,
      };
      return {
        row: {
          id: spec.id,
        },
        ctx,
      };
    }

    case "requirement": {
      const [requirement] = await db
        .select()
        .from(requirements)
        .where(eq(requirements.id, id));
      if (!requirement) return null;
      const [spec] = await db.select().from(specs).where(eq(specs.id, requirement.specId));
      const [domain] = spec
        ? await db.select().from(specDomains).where(eq(specDomains.id, spec.domainId))
        : [undefined];
      const [project] = domain
        ? await db.select().from(projects).where(eq(projects.id, domain.projectId))
        : [undefined];
      const rootPath = project?.rootPath;
      const ctx: ReferenceContext = {
        repoRoot: resolveRepoRoot(rootPath),
        projectName: project?.name,
        projectRootPath: rootPath,
        domainName: domain?.name,
      };
      return {
        row: {
          id: requirement.id,
          title: requirement.title,
        },
        ctx,
      };
    }

    case "schema": {
      const [schema] = await db.select().from(schemas).where(eq(schemas.id, id));
      if (!schema) return null;
      const ctx: ReferenceContext = { repoRoot: resolveRepoRoot() };
      return {
        row: {
          id: schema.id,
          name: schema.name,
        },
        ctx,
      };
    }

    case "context-store": {
      const [store] = await db
        .select()
        .from(contextStores)
        .where(eq(contextStores.id, id));
      if (!store) return null;
      const ctx: ReferenceContext = { repoRoot: resolveRepoRoot() };
      return {
        row: {
          id: store.id,
          name: store.name,
          path: store.path,
        },
        ctx,
      };
    }

    case "workspace": {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id));
      if (!workspace) return null;
      const ctx: ReferenceContext = { repoRoot: resolveRepoRoot() };
      return {
        row: {
          id: workspace.id,
          name: workspace.name,
        },
        ctx,
      };
    }

    case "initiative": {
      const [initiative] = await db
        .select()
        .from(initiatives)
        .where(eq(initiatives.id, id));
      if (!initiative) return null;
      const ctx: ReferenceContext = { repoRoot: resolveRepoRoot() };
      return {
        row: {
          id: initiative.id,
          title: initiative.title,
        },
        ctx,
      };
    }

    default: {
      // Exhaustiveness guard — compile error if a new kind is added without a
      // case. Unreachable at runtime because the type is validated upstream.
      const _exhaustive: never = type;
      throw new Error(`Unsupported entity type: ${String(_exhaustive)}`);
    }
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;

  if (!isSupportedType(type)) {
    return NextResponse.json(
      {
        error: `Unsupported entity type: ${type}`,
        supportedTypes: SUPPORTED_REFERENCE_TYPES,
      },
      { status: 400 },
    );
  }

  // Resolve the entity, defending against any underlying error (invalid id
  // format, transient DB failure, etc.) by collapsing it into a clean 404.
  // Per task 2.2 / design risk note, the error body names only the type + id
  // and never leaks internal filesystem paths, stack frames, or query text.
  let fetched: { row: BuildRow; ctx: ReferenceContext } | null;
  try {
    fetched = await fetchReference(type, id);
  } catch {
    return NextResponse.json(
      { error: `${type} not found`, id },
      { status: 404 },
    );
  }
  if (!fetched) {
    // 404 JSON error body. Body names only the type + id, never internal paths.
    return NextResponse.json(
      { error: `${type} not found`, id },
      { status: 404 },
    );
  }

  const payload = buildEntityReference(type, fetched.row, fetched.ctx);
  return NextResponse.json(payload);
}
