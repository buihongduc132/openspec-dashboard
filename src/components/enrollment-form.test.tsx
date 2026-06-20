import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// `EnrollmentForm` uses `useRouter` for the post-enrollment redirect (task
// 3.5); mock it here so the Local-tab tests (task 3.2) still render cleanly.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
import { EnrollmentForm } from "@/components/enrollment-form";

/**
 * Task 3.2 — Build enrollment client component with a "Local" tab:
 * path input + validate button.
 *
 * Spec requirement "Local project enrollment":
 *   The dashboard SHALL provide an enrollment flow that lets the user select
 *   a local directory and enroll it as a tracked project. During enrollment
 *   the app MUST detect whether the directory is already an OpenSpec project.
 *
 * This task owns the CLIENT component surface for the Local tab only:
 *   - a "Local" tab is present,
 *   - a path input lets the user type/paste an absolute local path,
 *   - a "Validate" button triggers validation of that path against the
 *     enrollment endpoint (`POST /api/enrollment/local`, owned by task 3.3).
 *
 * The remote-git tab (task 4.1) and the server endpoint (task 3.3) are out of
 * scope here; we only assert the Local-tab UI and that clicking Validate
 * dispatches a request carrying the entered path.
 */

describe("EnrollmentForm — Local tab (task 3.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a 'Local' tab with a path input and a Validate button", () => {
    render(<EnrollmentForm />);

    // The Local tab trigger is reachable by name.
    const localTab = screen.getByRole("tab", { name: /local/i });
    expect(localTab).toBeTruthy();

    // By default the Local tab is selected, so its content (path input +
    // validate button) is present in the document.
    const pathInput = screen.getByLabelText(/path/i);
    expect(pathInput).toBeTruthy();

    const validateButton = screen.getByRole("button", { name: /validate/i });
    expect(validateButton).toBeTruthy();
  });

  it("sends the entered path to the local-enrollment endpoint when Validate is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, openSpecProject: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);

    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: "/repos/my-project" } });

    const validateButton = screen.getByRole("button", { name: /validate/i });
    fireEvent.click(validateButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/enrollment/local");
    expect(init.method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.path).toBe("/repos/my-project");
  });
});
