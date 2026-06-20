"use client";

import { cn, type PlanStatus } from "@/lib/utils";
import { SectionHeading } from "./flow-board";
import type { ScopedPlanRow } from "./types";

const statusStyles: Record<PlanStatus, string> = {
  Draft: "border-border bg-muted text-muted-foreground",
  Review: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Blocked: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  Shipped: "border-border bg-muted/60 text-muted-foreground",
};

type Props = {
  scopedPlans: ScopedPlanRow[];
};

/**
 * Ported from v4 Plan board section. Each row = an OpenSpec task surfaced with
 * its source project, owner, status, and due label.
 */
export function PlanTracker({ scopedPlans }: Props) {
  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Plan board"
        title="Scoped implementation queue"
        description="The queue keeps the source project visible while showing owner, status, and due date for each OpenSpec task."
      />

      <div className="overflow-hidden rounded-[1.7rem] border border-border/60 bg-card/85 shadow-sm">
        {scopedPlans.length > 0 ? (
          scopedPlans.map((plan, index) => (
            <div
              key={`${plan.projectName}-${plan.title}-${index}`}
              className={cn(
                "grid gap-4 px-4 py-4 transition hover:bg-muted/40 sm:grid-cols-[1fr_auto] sm:items-center",
                index !== 0 && "border-t border-border/50"
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: plan.accent }}
                  />
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {plan.projectName}
                  </p>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{plan.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Owner: {plan.owner || "Unassigned"} · Due: {plan.due}
                </p>
              </div>
              <span
                className={cn(
                  "w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                  statusStyles[plan.status]
                )}
              >
                {plan.status}
              </span>
            </div>
          ))
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            No tasks are in scope right now.
          </div>
        )}
      </div>
    </div>
  );
}
