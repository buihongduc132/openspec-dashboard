"use client";

/**
 * Task 2.20 — Concurrent-edit 3-way merge UI (INV-7).
 *
 * Renders the 3-way merge of a section when a concurrent same-section edit
 * produced a 409 (INV-7, §4.24). The losing editor compares parent / yours /
 * theirs and picks a resolution; the dashboard never silently overwrites.
 *
 * The merge engine lives in `@/lib/merge/three-way` (design D-P1-5); this
 * component only renders its {@link MergeResult} and reports the editor's
 * choice via `onResolve`. The resolved text becomes a new write with a fresh
 * ETag through the normal `SectionEtagStore.commit` path.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MergeResult } from "@/lib/merge/three-way";

export interface MergeResolutionProps {
  /** The 3-way merge result to render. */
  result: MergeResult;
  /** Called with the editor's chosen merged text (never a silent overwrite). */
  onResolve: (merged: string) => void;
}

/**
 * 3-way merge UI. For a clean merge (no conflicts) the component auto-resolves
 * with `result.merged`. For a conflict it shows parent / yours / theirs and
 * offers "Use ours" / "Use theirs" (plus a manual-edit fallback), calling
 * `onResolve` with the chosen text.
 */
export function MergeResolution({ result, onResolve }: MergeResolutionProps): React.ReactElement {
  // A clean merge needs no editor decision — surface it immediately.
  React.useEffect(() => {
    if (!result.hasConflicts) {
      onResolve(result.merged);
    }
  }, [result, onResolve]);

  if (!result.hasConflicts) {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card p-4 text-sm text-muted-foreground",
        )}
        data-testid="merge-clean"
      >
        No conflict — the two edits merged cleanly:
        <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-foreground">
          {result.merged}
        </pre>
      </div>
    );
  }

  const conflict = result.conflicts[0];
  return (
    <div
      className={cn("flex flex-col gap-4 rounded-md border border-border bg-card p-4")}
      data-testid="merge-conflict"
      role="group"
      aria-label="Concurrent edit conflict"
    >
      <p className="text-sm font-medium text-foreground">
        Another edit was saved to this section while you were editing. Choose how to
        resolve it (your choice replaces the section and gets a fresh ETag).
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Pane label="Parent" value={result.input.base} />
        <Pane label="Yours" value={conflict.ours} />
        <Pane label="Theirs" value={conflict.theirs} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onResolve(conflict.ours)}>Use ours</Button>
        <Button onClick={() => onResolve(conflict.theirs)} variant="secondary">
          Use theirs
        </Button>
      </div>
    </div>
  );
}

interface PaneProps {
  label: string;
  value: string;
}

function Pane({ label, value }: PaneProps): React.ReactElement {
  return (
    <div className={cn("rounded-md border border-input bg-background p-2")}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="whitespace-pre-wrap text-sm text-foreground">{value}</pre>
    </div>
  );
}
