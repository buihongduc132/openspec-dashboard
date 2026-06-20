/**
 * Task 3.5 — On success, register the project (`enrollmentSource = "local"`,
 * `projected = true`) and redirect to the project view.
 *
 * After the local-validation endpoint reports `isOpenSpec: true` (or the user
 * has accepted the init offer, task 3.4), the enrollment flow must:
 *   1. Show an "Enroll" button that lets the user commit the enrollment.
 *   2. On click, POST to `/api/projects` with `enrollmentSource = "local"`,
 *      `projected = true`, and the validated path as `rootPath`.
 *   3. On success, redirect (via `useRouter`) to the new project's view
 *      (`/projects/[id]`).
 *
 * This file captures those requirements as unit tests on the EnrollmentForm
 * client component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { EnrollmentForm } from "@/components/enrollment-form";

// Mock next/navigation — the component needs `useRouter` for the redirect.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("EnrollmentForm — local enrollment commit (task 3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows an Enroll button after successful validation of an OpenSpec directory", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ path: "/tmp/my-project", isOpenSpec: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);

    // Enter a path and validate.
    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: "/tmp/my-project" } });

    const validateButton = screen.getByRole("button", { name: /validate/i });
    fireEvent.click(validateButton);

    // After validation succeeds, an Enroll button appears.
    await waitFor(() => {
      const enrollButton = screen.getByRole("button", { name: /enroll/i });
      expect(enrollButton).toBeTruthy();
    });
  });

  it("registers the project and redirects to the project view when Enroll is clicked", async () => {
    // First call: validation (POST /api/enrollment/local)
    // Second call: enrollment (POST /api/projects)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ path: "/tmp/my-project", isOpenSpec: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "new-project-id-123",
          name: "my-project",
          rootPath: "/tmp/my-project",
          enrollmentSource: "local",
          projected: true,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);

    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: "/tmp/my-project" } });

    // Validate first.
    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    // Then enroll.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /enroll/i }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /enroll/i }));

    // The second fetch call should be POST /api/projects with the right body.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/projects");
    expect(init.method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.rootPath).toBe("/tmp/my-project");
    expect(body.enrollmentSource).toBe("local");
    expect(body.projected).toBe(true);

    // Redirect to the project view.
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/projects/new-project-id-123"),
    );
  });

  it("shows an error and does NOT redirect when project creation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ path: "/tmp/my-project", isOpenSpec: true }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "something broke" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);

    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: "/tmp/my-project" } });

    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /enroll/i }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /enroll/i }));

    // No redirect on failure.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(mockPush).not.toHaveBeenCalled();

    // An error message is shown.
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeTruthy();
    });
  });
});
