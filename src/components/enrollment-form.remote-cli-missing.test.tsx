/**
 * Task 4.4 — On no/failed CLI: show which CLI is missing; do NOT clone;
 * do NOT enroll.
 *
 * Spec requirement "Remote git enrollment via gh / glab (planned, stubbed)",
 * scenario "No authenticated CLI for the URL host":
 *   WHEN the user pastes a GitLab URL but `glab` is not installed or not
 *   authenticated, THEN the flow reports which CLI is missing and does NOT
 *   enroll the project, and no shell command clones anything.
 *
 * These tests drive the EnrollmentForm's Remote git tab end-to-end:
 *   - typing a remote URL and submitting it,
 *   - asserting that when the server reports a missing/unauthenticated CLI
 *     (HTTP 409), the form SURFACES which CLI is required (by name) in an
 *     error message,
 *   - asserting the user is NOT redirected (no enrollment happened).
 *
 * The fetch layer is stubbed so no real HTTP / no real CLI / no clone runs.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

// `EnrollmentForm` uses `useRouter`; capture the push spy so we can assert
// it is NOT called when the CLI is missing (no enrollment redirect).
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));
import { EnrollmentForm } from "@/components/enrollment-form";

describe("EnrollmentForm — Remote git tab: missing/failed CLI (task 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function activateRemoteTab() {
    const remoteTab = screen.getByRole("tab", { name: /remote git/i });
    fireEvent.keyDown(remoteTab, { key: "Enter" });
  }

  it("shows which CLI is missing (glab) when the GitLab CLI is not installed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error:
          'glab is required for "gitlab.com" but is not installed or not on PATH.',
        detection: {
          url: "https://gitlab.com/org/repo",
          host: "gitlab.com",
          requiredCli: "glab",
          cliResult: {
            status: "missing",
            reason: "glab is not installed or not on PATH",
          },
          actionable: false,
          message:
            'glab is required for "gitlab.com" but is not installed or not on PATH.',
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);
    activateRemoteTab();

    const urlInput = screen.getByLabelText(/url/i) as HTMLInputElement;
    fireEvent.change(urlInput, {
      target: { value: "https://gitlab.com/org/repo" },
    });

    const submitButton = screen.getByRole("button", {
      name: /enroll|check|detect|submit/i,
    });
    fireEvent.click(submitButton);

    // The surfaced error names the missing CLI.
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent?.toLowerCase()).toContain("glab");
    });
  });

  it("shows which CLI is missing (gh) when the GitHub CLI is not authenticated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error:
          "gh is installed but not authenticated. Run `gh auth login` and try again.",
        detection: {
          url: "https://github.com/org/repo",
          host: "github.com",
          requiredCli: "gh",
          cliResult: { status: "error", reason: "You are not logged in." },
          actionable: false,
          message:
            "gh is installed but not authenticated. Run `gh auth login` and try again.",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);
    activateRemoteTab();

    const urlInput = screen.getByLabelText(/url/i) as HTMLInputElement;
    fireEvent.change(urlInput, {
      target: { value: "https://github.com/org/repo" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /enroll|check|detect|submit/i }),
    );

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent?.toLowerCase()).toContain("gh");
    });
  });

  it("does NOT enroll (no redirect) when the CLI is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error:
          'glab is required for "gitlab.com" but is not installed or not on PATH.',
        detection: {
          url: "https://gitlab.com/org/repo",
          host: "gitlab.com",
          requiredCli: "glab",
          cliResult: { status: "missing", reason: "glab not on PATH" },
          actionable: false,
          message:
            'glab is required for "gitlab.com" but is not installed or not on PATH.',
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);
    activateRemoteTab();

    const urlInput = screen.getByLabelText(/url/i) as HTMLInputElement;
    fireEvent.change(urlInput, {
      target: { value: "https://gitlab.com/org/repo" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /enroll|check|detect|submit/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // No redirect means no enrollment happened.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("submits to /api/enrollment/remote and does NOT trigger any git clone", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error:
          'glab is required for "gitlab.com" but is not installed or not on PATH.',
        detection: {
          url: "https://gitlab.com/org/repo",
          host: "gitlab.com",
          requiredCli: "glab",
          cliResult: { status: "missing", reason: "glab not on PATH" },
          actionable: false,
          message:
            'glab is required for "gitlab.com" but is not installed or not on PATH.',
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EnrollmentForm />);
    activateRemoteTab();

    const urlInput = screen.getByLabelText(/url/i) as HTMLInputElement;
    fireEvent.change(urlInput, {
      target: { value: "https://gitlab.com/org/repo" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /enroll|check|detect|submit/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("/api/enrollment/remote");
    expect((init as RequestInit).method).toBe("POST");
    // Only ONE fetch call → no clone endpoint was hit.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
