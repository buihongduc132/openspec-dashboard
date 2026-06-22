/**
 * Task 2.20 — Concurrent-edit 3-way merge UI (INV-7) component tests.
 *
 * Spec source: `flow/requirements/04-tasks-kanban.md` §4.24 — concurrent
 * same-section edits return 409 + a 3-way merge UI (yours / theirs / parent)
 * where the losing editor chooses the resolution; never a silent overwrite.
 *
 * Behaviour asserted here:
 *  - The three views (parent / yours / theirs) are all rendered so the editor
 *    can compare them.
 *  - For each conflict the editor can pick "Use ours" or "Use theirs", and
 *    the chosen resolution is passed to `onResolve` (never a silent pick).
 *  - A clean merge (no conflicts) resolves immediately with the merged text.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { threeWayMerge } from "@/lib/merge/three-way";
import { MergeResolution } from "@/components/merge-resolution";

afterEach(() => cleanup());

describe("MergeResolution", () => {
  it("renders parent, yours, and theirs views for a conflict", () => {
    const result = threeWayMerge({
      base: "- [ ] deploy to production",
      ours: "- [ ] deploy to staging",
      theirs: "- [ ] deploy to preview",
    });

    render(<MergeResolution result={result} onResolve={vi.fn()} />);

    // All three sides are visible for comparison.
    expect(screen.getAllByText(/parent/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/yours/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/theirs/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/staging/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/preview/i).length).toBeGreaterThan(0);
  });

  it("lets the editor choose 'ours' and reports that resolution", () => {
    const onResolve = vi.fn();
    const result = threeWayMerge({
      base: "aaa",
      ours: "bbb",
      theirs: "ccc",
    });

    render(<MergeResolution result={result} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: /use ours/i }));
    expect(onResolve).toHaveBeenCalledWith("bbb");
  });

  it("lets the editor choose 'theirs' and reports that resolution", () => {
    const onResolve = vi.fn();
    const result = threeWayMerge({
      base: "aaa",
      ours: "bbb",
      theirs: "ccc",
    });

    render(<MergeResolution result={result} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: /use theirs/i }));
    expect(onResolve).toHaveBeenCalledWith("ccc");
  });

  it("auto-resolves a clean merge (no conflicts) with the merged text", () => {
    const onResolve = vi.fn();
    const result = threeWayMerge({
      base: "- [ ] do the thing",
      ours: "- [ ] do the thing carefully",
      theirs: "- [x] do the thing",
    });

    render(<MergeResolution result={result} onResolve={onResolve} />);

    expect(onResolve).toHaveBeenCalledWith(result.merged);
  });
});
