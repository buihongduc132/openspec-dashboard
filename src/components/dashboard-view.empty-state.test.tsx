import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DashboardView } from "@/components/dashboard-view";

/**
 * Task 2.5 — Render the empty state ("no projects enrolled yet") with a
 * prominent enrollment CTA.
 *
 * Spec scenario "Empty dashboard before any enrollment":
 *   WHEN no projects are enrolled and the user opens `/`
 *   THEN the collective dashboard renders with zero counts, a clear "no
 *   projects enrolled yet" state, and a prominent enrollment entry point.
 *
 * The DashboardView receives projects/aggregate as props, so we drive it
 * directly with an empty project list.
 */

const EMPTY_AGGREGATE = {
  projectCount: 0,
  totalInFlightChanges: 0,
  totalOpenTasks: 0,
};

describe("Collective dashboard empty state (task 2.5)", () => {
  it("renders a 'no projects enrolled yet' state with a prominent enrollment CTA when there are no projects", () => {
    render(<DashboardView projects={[]} aggregate={EMPTY_AGGREGATE} />);

    // The empty state must clearly announce that nothing is enrolled yet.
    const emptyState = screen.getByTestId("empty-collective");
    expect(emptyState.textContent ?? "").toMatch(/no projects enrolled yet/i);

    // The prominent enrollment call-to-action must link to the enrollment
    // entry point (`/projects/new`) so the user has a clear next step.
    const cta = within(emptyState).getByRole("link", {
      name: /enroll|add project|new project/i,
    });
    expect(cta.getAttribute("href")).toBe("/projects/new");
  });
});
