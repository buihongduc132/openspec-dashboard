"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, getInitials, pluralize } from "@/lib/utils";
import { FlowBoard } from "./v4/flow-board";
import { PlanTracker } from "./v4/plan-tracker";
import { ProjectMatrix } from "./v4/project-matrix";
import type {
  FlowKey,
  ProjectView,
  ScopedFlowItem,
  ScopedPlanRow,
} from "./v4/types";

type Props = {
  projects: ProjectView[];
};

/**
 * v4-style multi-project dashboard view. Holds the active-project scope and
 * search query as client state; all data arrives serialized from the server
 * (real DB rows). Layout + motion language ported from v4 App.tsx.
 */
export function DashboardView({ projects }: Props) {
  const [activeProjectId, setActiveProjectId] = useState<string>("all");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredProjects = useMemo(() => {
    if (!normalizedQuery) return projects;
    return projects.filter((project) => {
      const searchable = [
        project.name,
        project.area,
        project.owner,
        project.phase,
        project.health,
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [normalizedQuery, projects]);

  const selectedProject = projects.find((p) => p.id === activeProjectId);

  const scopedProjects = useMemo(() => {
    if (activeProjectId === "all") return filteredProjects;
    return selectedProject ? [selectedProject] : [];
  }, [activeProjectId, filteredProjects, selectedProject]);

  const scopedFlow = useMemo(() => {
    const empty: Record<FlowKey, ScopedFlowItem[]> = {
      findings: [],
      requirements: [],
      intentions: [],
      plans: [],
    };
    return (Object.keys(empty) as FlowKey[]).reduce<Record<FlowKey, ScopedFlowItem[]>>(
      (acc, key) => {
        acc[key] = scopedProjects.flatMap((project) =>
          project.flow[key].map((item) => ({
            ...item,
            projectName: project.name,
            accent: project.accent,
          }))
        );
        return acc;
      },
      empty
    );
  }, [scopedProjects]);

  const scopedPlans = useMemo<ScopedPlanRow[]>(
    () =>
      scopedProjects.flatMap((project) =>
        project.plan.map((item) => ({
          ...item,
          projectName: project.name,
          accent: project.accent,
        }))
      ),
    [scopedProjects]
  );

  const totals = useMemo(() => {
    const projectCount = scopedProjects.length;
    const totalProgress = scopedProjects.reduce((s, p) => s + p.progress, 0);
    const averageProgress = projectCount
      ? Math.round(totalProgress / projectCount)
      : 0;
    const risks = scopedProjects.reduce((s, p) => s + p.risk, 0);
    const activePlans = scopedPlans.filter((p) => p.status !== "Shipped").length;
    return {
      projectCount,
      averageProgress,
      risks,
      activePlans,
      findings: scopedFlow.findings.length,
      requirements: scopedFlow.requirements.length,
      intentions: scopedFlow.intentions.length,
      plans: scopedFlow.plans.length,
    };
  }, [scopedFlow, scopedPlans, scopedProjects]);

  const activeAccent = selectedProject?.accent ?? "#4f46e5";
  const dashboardTitle = selectedProject
    ? selectedProject.name
    : "Multiple project dashboard";
  const dashboardSummary = selectedProject
    ? selectedProject.summary
    : "Review every OpenSpec project from one scoped dashboard, then drill into the exact findings, requirements, intentions, and plans that need work.";
  const scopeLabel = selectedProject
    ? `${selectedProject.area} · ${selectedProject.phase}`
    : `${pluralize(totals.projectCount, "project")} in current scope`;
  const emptyScope = scopedProjects.length === 0;

  return (
    <main className="min-h-screen">
      {/* Ambient warm gradient layer (v4 signature) — theme-aware */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(234,88,12,0.08),transparent_28%)] dark:opacity-40"
        aria-hidden
      />

      <div className="mx-auto w-full max-w-[1680px] px-5 py-6 sm:px-7 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-7xl space-y-7">
          {/* Header */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-reveal">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Multi-project workspace
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                OpenSpec Dashboard
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href="/projects"
                className="rounded-full border border-border bg-card px-4 py-2 font-medium text-foreground transition hover:bg-muted"
              >
                All projects
              </Link>
              <Link
                href="/projects/new"
                className="rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                New project
              </Link>
            </div>
          </header>

          {/* Scope switcher row (search + project pills) */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="block sm:w-80">
              <span className="sr-only">Search projects</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, owners, phases"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <ScopePill
                active={activeProjectId === "all"}
                onClick={() => setActiveProjectId("all")}
                label="All projects"
                count={filteredProjects.length}
              />
              {filteredProjects.map((project) => (
                <ScopePill
                  key={project.id}
                  active={activeProjectId === project.id}
                  onClick={() => setActiveProjectId(project.id)}
                  label={project.name}
                  accent={project.accent}
                  count={project.activeChanges}
                />
              ))}
            </div>
          </div>

          {/* Hero card */}
          <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-900/20 sm:p-7 lg:p-8 animate-reveal-delayed dark:bg-slate-900/95">
            <div
              className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl orbit-pulse"
              style={{ backgroundColor: activeAccent }}
              aria-hidden
            />
            <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
              <div className="max-w-3xl space-y-6">
                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white/70">
                  {scopeLabel}
                </div>
                <div className="space-y-4">
                  <h3 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                    {dashboardTitle}
                  </h3>
                  <p className="max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
                    {dashboardSummary}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="#flow"
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    Review flow
                  </a>
                  <a
                    href="#plans"
                    className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Open plans
                  </a>
                </div>
              </div>

              {/* Scoped health ring + per-project bars */}
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.07] p-4 backdrop-blur-md sm:p-5">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Scoped health</p>
                    <p className="mt-1 text-xs text-white/50">
                      Aggregated from active project selection
                    </p>
                  </div>
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(${activeAccent} ${totals.averageProgress * 3.6}deg, rgba(255,255,255,0.12) 0deg)`,
                      }}
                    />
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold dark:bg-slate-900">
                      {totals.averageProgress}%
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {(activeProjectId === "all"
                    ? scopedProjects
                    : scopedProjects.slice(0, 1)
                  ).map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setActiveProjectId(project.id)}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left transition hover:bg-white/[0.1]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                            style={{ backgroundColor: project.accent }}
                          >
                            {getInitials(project.name)}
                          </span>
                          <p className="truncate text-sm font-medium">{project.name}</p>
                        </div>
                        <span className="text-sm text-white/70">{project.progress}%</span>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full progress-grow"
                          style={{
                            width: `${project.progress}%`,
                            backgroundColor: project.accent,
                          }}
                        />
                      </div>
                    </button>
                  ))}

                  {emptyScope ? (
                    <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/55">
                      No scoped projects to summarize.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* Metric tiles */}
          <section
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Dashboard metrics"
          >
            <MetricTile
              label="Projects"
              value={totals.projectCount.toString()}
              detail={activeProjectId === "all" ? "Visible in scope" : "Selected project"}
            />
            <MetricTile
              label="Active plans"
              value={totals.activePlans.toString()}
              detail={`${totals.plans} OpenSpec plan signals`}
            />
            <MetricTile
              label="Requirements"
              value={totals.requirements.toString()}
              detail={`${totals.averageProgress}% average coverage`}
            />
            <MetricTile
              label="Risks"
              value={totals.risks.toString()}
              detail={totals.risks ? "Needs follow-up" : "No active blockers"}
            />
          </section>

          {/* Flow board (ported from v4) */}
          <FlowBoard
            scopedFlow={scopedFlow}
            scope={activeProjectId}
            emptyScope={emptyScope}
          />

          {/* Plan tracker + project matrix (ported from v4) */}
          <section
            id="plans"
            className="grid gap-5 scroll-mt-8 xl:grid-cols-[1.05fr_0.95fr]"
          >
            <PlanTracker scopedPlans={scopedPlans} />
            <ProjectMatrix
              projects={projects}
              activeProjectId={activeProjectId}
              onSelect={setActiveProjectId}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function ScopePill({
  active,
  onClick,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      )}
    >
      {accent ? (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
      ) : null}
      <span className="truncate max-w-[10rem]">{label}</span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px]",
            active ? "bg-background/20" : "bg-muted"
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur-sm animate-rise">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-4xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-right text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
