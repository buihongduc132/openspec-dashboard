import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProjectMatrix } from "@/components/v4/project-matrix";
import type { ProjectView } from "@/components/v4/types";

/**
 * Task 2.3 — Keep per-project cards below the aggregation, each linking into
 * its project view (`/projects/[id]`). Each card in the project matrix MUST be
 * an anchor/link that drills into the single-project OpenSpec view, not just a
 * button that re-scopes the dashboard.
 */

const baseProject: ProjectView = {
  id: "proj-1",
  name: "Atlas",
  area: "Core platform",
  owner: "Ada",
  phase: "2 active changes",
  updated: "just now",
  accent: "#4f46e5",
  health: "On track",
  progress: 62,
  risk: 1,
  summary: "Atlas project",
  activeChanges: 2,
  flow: { findings: [], requirements: [], intentions: [], plans: [] },
  plan: [],
};

describe("ProjectMatrix per-project card linking (task 2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a link into the project view for each project card", () => {
    render(
      <ProjectMatrix
        projects={[
          { ...baseProject, id: "proj-1", name: "Atlas" },
          { ...baseProject, id: "proj-2", name: "Borealis" },
        ]}
        activeProjectId="all"
        onSelect={() => {}}
      />,
    );

    const atlasLink = screen.getByRole("link", { name: /atlas/i });
    const borealisLink = screen.getByRole("link", { name: /borealis/i });

    expect(atlasLink.getAttribute("href")).toBe("/projects/proj-1");
    expect(borealisLink.getAttribute("href")).toBe("/projects/proj-2");
  });

  it("links into the project view even when the project is active", () => {
    render(
      <ProjectMatrix
        projects={[{ ...baseProject, id: "proj-1", name: "Atlas" }]}
        activeProjectId="proj-1"
        onSelect={() => {}}
      />,
    );

    const link = screen.getByRole("link", { name: /atlas/i });
    expect(link.getAttribute("href")).toBe("/projects/proj-1");
  });
});
