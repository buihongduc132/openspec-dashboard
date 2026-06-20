import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The enrollment entry point uses `next/navigation` via the EnrollmentForm;
// mock it so the page renders cleanly in unit tests.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import NewProjectPage from "@/app/projects/new/page";

/**
 * Task 3.6 — Reuse/extend `src/app/projects/new/page.tsx` as the enrollment
 * entry point (tabbed: Local / Remote git).
 *
 * The page at `/projects/new` is no longer a plain manual-registration form; it
 * IS the collective-dashboard enrollment on-ramp. It renders the tabbed
 * `EnrollmentForm`, so the user lands on an enrollment flow (Local path picker
 * today, with a Remote-git tab reserved for task 4.1).
 */

describe("/projects/new — enrollment entry point (task 3.6)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the enrollment form (Local tab) instead of a plain manual form", () => {
    render(<NewProjectPage />);

    // The tabbed enrollment form is present: a "Local" tab + a path input +
    // a "Validate" button (owned by the EnrollmentForm client component).
    expect(screen.getByRole("tab", { name: /local/i })).toBeTruthy();
    expect(screen.getByLabelText(/path/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /validate/i })).toBeTruthy();
  });

  it("exposes a Remote-git enrollment tab so the flow is discoverable", () => {
    render(<NewProjectPage />);

    // The entry point must advertise BOTH enrollment sources (Local / Remote
    // git) even if the Remote tab is stubbed (task 4.1 wires its content).
    expect(screen.getByRole("tab", { name: /remote git/i })).toBeTruthy();
  });

  it("signals its enrollment-scope heading so it is not mistaken for a single project", () => {
    render(<NewProjectPage />);
    // An enrollment/onboarding heading is present.
    const heading = screen.getByRole("heading", {
      name: /enroll|new project/i,
    });
    expect(heading).toBeTruthy();
  });
});
