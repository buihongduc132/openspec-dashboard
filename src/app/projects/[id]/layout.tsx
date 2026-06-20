import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { projects } from "@/db/schema";

/**
 * Single-project layout (tasks 5.1 + 5.2).
 *
 * Every page under `/projects/[id]/*` is a *single-project* view. The
 * collective dashboard lives at `/`. To keep the collective ↔ single
 * navigation model reversible and unambiguous (spec requirement
 * "Drill-down from collective to single project"), this layout renders a
 * consistent breadcrumb at the top of every single-project page:
 *
 *   All projects › <active project name>
 *
 * The "All projects" crumb targets `/` (the collective dashboard), per the
 * spec scenario "Drill into a project and return": the URL must reflect `/`
 * (collective), not the registry list. The active project name crumb makes
 * the single-project scope visually distinct from the collective overview
 * (scenario "Single-project view signals its scope"). Individual pages keep
 * their own layout/padding and may render deeper sub-breadcrumbs; this
 * layout only owns the top-level collective affordance so it is consistent
 * across every single-project route.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Validate UUID format before querying the database to prevent raw
  // database errors on malformed URLs (e.g. `/projects/not-a-uuid`).
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) return notFound();

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="px-6 pt-6 lg:px-10"
      >
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-1 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All projects
            </Link>
          </li>
          <li aria-hidden="true" className="flex items-center">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion --
              project.name is non-nullable in the schema */}
          <li>
            <span
              className="px-1 font-medium text-foreground"
              aria-current="page"
              data-testid="active-project-name"
            >
              {project.name!}
            </span>
          </li>
        </ol>
      </nav>
      {children}
    </>
  );
}
