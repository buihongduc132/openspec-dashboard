"use client";

import { cn, type Health } from "@/lib/utils";
import { SectionHeading } from "./flow-board";
import type { ProjectView } from "./types";

const healthStyles: Record<Health, string> = {
  "On track":
    "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "Needs review":
    "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  "At risk": "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30",
};

type Props = {
  projects: ProjectView[];
  activeProjectId: string;
  onSelect: (id: string) => void;
};

/**
 * Ported from v4 Project matrix section. Compact comparison of progress,
 * health, risk, and current phase across all registered projects.
 */
export function ProjectMatrix({ projects, activeProjectId, onSelect }: Props) {
  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Project matrix"
        title="Compare active projects"
        description="A compact dashboard view for progress, health, risk, and the current OpenSpec phase."
      />

      <div className="rounded-[1.7rem] border border-border/60 bg-card/85 p-4 shadow-sm">
        <div className="space-y-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelect(project.id)}
              className={cn(
                "w-full rounded-2xl border p-3 text-left transition hover:bg-muted/40",
                activeProjectId === project.id
                  ? "border-border bg-muted/40"
                  : "border-transparent"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: project.accent }}
                    />
                    <p className="font-semibold text-foreground">{project.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{project.phase}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    healthStyles[project.health]
                  )}
                >
                  {project.health}
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full progress-grow"
                    style={{
                      width: `${project.progress}%`,
                      backgroundColor: project.accent,
                    }}
                  />
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {project.progress}% coverage
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  {project.risk === 1 ? "1 risk" : `${project.risk} risks`}
                </p>
              </div>
            </button>
          ))}

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
              No projects registered yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
