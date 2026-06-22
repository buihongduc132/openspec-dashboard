"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  computeVelocity,
  type VelocitySeries,
} from "@/lib/dashboard-analytics/velocity";

type WindowDays = 7 | 30 | 90;

type Props = {
  /** All completion timestamps across the project (audit-log task.completed). */
  completions: Date[];
  projectId: string;
};

const WINDOWS: { label: string; days: WindowDays }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

/**
 * Task velocity burn-up chart (req 7.5). Renders a lightweight inline-SVG bar
 * chart (no external chart dependency) of tasks completed per day over a
 * configurable window (req 7.5b: 7 / 30 / 90 days).
 */
export function VelocityChart({ completions, projectId }: Props) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);

  const series = useMemo<VelocitySeries>(
    () => computeVelocity(completions, { windowDays, bucket: "day" }),
    [completions, windowDays]
  );

  const maxCompleted = Math.max(1, ...series.buckets.map((b) => b.completed));

  // For large windows (90 bars) we still render every bar but keep the chart
  // horizontally scrollable on small screens.
  return (
    <section
      data-testid="velocity-chart"
      data-project-id={projectId}
      aria-label="Task velocity"
      className="rounded-[1.6rem] border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur-sm animate-rise"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Task velocity
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {series.total} task{series.total === 1 ? "" : "s"} completed · burn-up
            per day
          </p>
        </div>
        <div
          role="group"
          aria-label="Velocity window"
          className="flex items-center gap-1 rounded-full border border-border bg-card p-1"
        >
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              aria-pressed={windowDays === w.days}
              onClick={() => setWindowDays(w.days)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                windowDays === w.days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div
          className="flex h-40 min-w-full items-end gap-px"
          role="img"
          aria-label={`Bar chart of tasks completed per day over the last ${windowDays} days`}
        >
          {series.buckets.map((bucket, i) => {
            const heightPct = (bucket.completed / maxCompleted) * 100;
            return (
              <div
                key={`${bucket.date}-${i}`}
                className="group relative flex flex-1 flex-col justify-end"
                style={{ minWidth: 2 }}
                title={`${bucket.date}: ${bucket.completed}`}
              >
                <div
                  className="w-full rounded-t-sm bg-primary/70 transition group-hover:bg-primary"
                  style={{ height: `${heightPct}%` }}
                  data-date={bucket.date}
                  data-completed={bucket.completed}
                />
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Sourced from audit-log completion events (req 7.5a).
      </p>
    </section>
  );
}
