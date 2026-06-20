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
} from "@testing-library/react";

// Mock `next/navigation` (used by `EnrollmentForm`) for the Remote-git
// tab tests (task 4.1).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
import { EnrollmentForm } from "@/components/enrollment-form";

/**
 * Task 4.1 — Add "Remote git" tab to the enrollment component
 * (GitHub / GitLab URL input).
 *
 * Spec requirement "Remote git enrollment via gh / glab (planned, stubbed)":
 *   The dashboard SHALL expose a remote-git enrollment tab where the user
 *   pastes a GitHub or GitLab URL.
 *
 * This task owns the CLIENT component surface for the Remote-git tab only:
 *   - a "Remote git" tab is present and reachable,
 *   - the tab renders a URL input letting the user paste a GitHub/GitLab URL,
 *   - the URL input is clearly labeled as a remote repository URL.
 *
 * The CLI detection (task 4.2), pending enrollment (task 4.3), and the
 * missing-CLI messaging (task 4.4) are out of scope here; we only assert the
 * Remote-git tab UI is reachable and accepts a URL.
 */
describe("EnrollmentForm — Remote git tab (task 4.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a 'Remote git' tab that is selectable", () => {
    render(<EnrollmentForm />);

    const remoteTab = screen.getByRole("tab", { name: /remote git/i });
    expect(remoteTab).toBeTruthy();

    // Tab activation: Radix Tabs responds to mousedown / keydown events.
    // Focus the tab then press Enter — the most reliable activation in jsdom.
    // After activation, the content panel (with the URL input) becomes visible.
    remoteTab.focus();
    fireEvent.keyDown(remoteTab, { key: "Enter" });

    expect(screen.getByLabelText(/url/i)).toBeTruthy();
  });

  it("shows a URL input in the Remote git tab", () => {
    render(<EnrollmentForm />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /remote git/i }), {
      key: "Enter",
    });

    const urlInput = screen.getByLabelText(/url/i);
    expect(urlInput).toBeTruthy();
    expect(urlInput.getAttribute("type")).toBe("url");
  });

  it("lets the user type a GitHub/GitLab URL into the Remote git input", () => {
    render(<EnrollmentForm />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /remote git/i }), {
      key: "Enter",
    });

    const urlInput = screen.getByLabelText(/url/i) as HTMLInputElement;
    fireEvent.change(urlInput, {
      target: { value: "https://github.com/org/repo" },
    });

    expect(urlInput.value).toBe("https://github.com/org/repo");
  });

  it("uses a placeholder hinting at GitHub / GitLab URLs", () => {
    render(<EnrollmentForm />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /remote git/i }), {
      key: "Enter",
    });

    const urlInput = screen.getByLabelText(/url/i) as HTMLInputElement;
    expect(urlInput.placeholder.toLowerCase()).toMatch(/github|gitlab/);
  });
});
