"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { flowColumns, type ScopedFlowItem } from "./types";

type Props = {
  scopedFlow: Record<string, ScopedFlowItem[]>;
  /** "all" → show up to 4 per column, single-project → up to 6. */
  scope: "all" | string;
  emptyScope: boolean;
};

/**
 * Ported from v4 App.tsx Flow Board section, wired to real scoped flow data.
 * Theme-aware: adapts to the app's light/dark tokens while keeping v4's
 * large-rounded-card + flow-reveal animation language.
 */
export function FlowBoard({ scopedFlow, scope, emptyScope }: Props) {
  const limit = scope === "all" ? 4 : 6;

  return (
    <section id="flow" className="space-y-4 scroll-mt-8">
      <SectionHeading
        eyebrow="OpenSpec flow"
        title="Findings, requirements, intentions, plans"
        description="Each column reads from the active project scope. Portfolio mode and single-project mode share the same dashboard logic."
      />

      <div className="grid gap-4 xl:grid-cols-4">
        {flowColumns.map((column, columnIndex) => {
          const items = scopedFlow[column.key] ?? [];
          return (
            <article
              key={column.key}
              className={cn(
                "rounded-[1.7rem] border p-4 shadow-sm backdrop-blur-sm",
                "border-border/60 bg-card/80"
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{column.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {column.description}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {items.length}
                </span>
              </div>

              <div className="space-y-3">
                {items.slice(0, limit).map((item, itemIndex) => (
                  <div
                    key={`${column.key}-${item.projectName}-${item.title}-${itemIndex}`}
                    className={cn(
                      "flow-reveal rounded-2xl border p-3",
                      "border-border/50 bg-muted/40"
                    )}
                    style={
                      {
                        animationDelay: `${columnIndex * 80 + itemIndex * 45}ms`,
                      } as CSSProperties
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.accent }}
                      />
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {item.projectName}
                      </p>
                    </div>
                    <h4 className="mt-2 text-sm font-semibold leading-5 text-foreground">
                      {item.title}
                    </h4>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {item.detail}
                    </p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
                      {item.state}
                    </p>
                  </div>
                ))}

                {items.length === 0 ? (
                  <div
                    className={cn(
                      "rounded-2xl border border-dashed p-4 text-sm text-muted-foreground",
                      "border-border/60"
                    )}
                  >
                    {emptyScope
                      ? "No projects in scope."
                      : `No ${column.label.toLowerCase()} found for this scope.`}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
