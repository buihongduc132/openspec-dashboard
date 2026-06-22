"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  describeActivityEvent,
  type ActivityEventInput,
} from "@/lib/dashboard-analytics/timeline";

type EventLike = ActivityEventInput & { createdAt: string };

type Props = {
  events: EventLike[];
  projectId: string;
};

/**
 * Change activity timeline (req 7.3). Renders a chronological feed of
 * audit-log events; each event deep-links to the affected entity (AC 7.3a)
 * and supports filtering by event type and actor (AC 7.3b).
 */
export function ActivityTimeline({ events, projectId }: Props) {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");

  const actionTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort(),
    [events]
  );
  const actors = useMemo(
    () =>
      Array.from(
        new Set(events.map((e) => e.author?.trim() || "Unattributed"))
      ).sort(),
    [events]
  );

  const filtered = useMemo(() => {
    return events
      .filter((e) => actionFilter === "all" || e.action === actionFilter)
      .filter((e) => {
        if (actorFilter === "all") return true;
        return (e.author?.trim() || "Unattributed") === actorFilter;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
  }, [events, actionFilter, actorFilter]);

  return (
    <section
      data-testid="activity-timeline"
      data-project-id={projectId}
      aria-label="Change activity timeline"
      className="rounded-[1.6rem] border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur-sm animate-rise"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Activity timeline
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Chronological feed of audit-log events (req 7.3).
          </p>
        </div>
      </div>

      {/* AC 7.3b — filters by event type + actor */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Event type</span>
          <select
            aria-label="Filter by event type"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs outline-none focus:border-ring"
          >
            <option value="all">All</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Actor</span>
          <select
            aria-label="Filter by actor"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs outline-none focus:border-ring"
          >
            <option value="all">All</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="mt-5 space-y-3">
        {filtered.length === 0 ? (
          <li
            data-testid="activity-empty"
            className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground"
          >
            No activity events match the current filters.
          </li>
        ) : (
          filtered.map((event, i) => {
            const descriptor = describeActivityEvent(event);
            const body = (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  {descriptor.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {descriptor.actor} · {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
            );
            return (
              <li
                key={`${event.action}-${event.entityId}-${i}`}
                data-action={event.action}
                className={cn(
                  "rounded-2xl border border-border/60 bg-card/70 p-3",
                  descriptor.href ? "transition hover:border-ring/60" : ""
                )}
              >
                {descriptor.href ? (
                  <Link
                    href={descriptor.href}
                    className="block"
                    data-testid="activity-link"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
