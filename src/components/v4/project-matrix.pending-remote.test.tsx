import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProjectMatrix } from "@/components/v4/project-matrix";
import type { ProjectView } from "@/components/v4/types";

/**
 * Task 4.5 — Render pending remote projects distinctly in the collective
 * dashboard (badge: "remote — pending clone"). A project enrolled via the
 * stubbed remote-git path is recorded as a pending remote project
 * (`enrollmentSource = "remote-git"`, `projected = false`) until full clone +
 * projection lands with git integration. Its card MUST render a distinct
 * badge so the user can tell it apart from fully-projected projects.
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

describe("ProjectMatrix pending remote badge (task 4.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a 'remote — pending clone' badge for a pending remote project", () => {
    render(
      <ProjectMatrix
        projects={[
          {
            ...baseProject,
            id: "proj-remote",
            name: "Faraway",
            pendingRemote: true,
            remoteGitUrl: "https://github.com/org/faraway",
          },
        ]}
        activeProjectId="all"
        onSelect={() => {}}
      />,
    );

    expect(
      screen.getByText("remote — pending clone").textContent,
    ).toBe("remote — pending clone");
  });

  it("does NOT render the pending-clone badge for a projected (local) project", () => {
    render(
      <ProjectMatrix
        projects={[
          {
            ...baseProject,
            id: "proj-local",
            name: "Atlas",
            pendingRemote: false,
          },
        ]}
        activeProjectId="all"
        onSelect={() => {}}
      />,
    );

    expect(screen.queryByText("remote — pending clone")).toBeNull();
  });
});
