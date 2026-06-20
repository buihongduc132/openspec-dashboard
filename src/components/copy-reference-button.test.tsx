import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { CopyReferenceButton } from "@/components/copy-reference-button";
import { renderReferenceMarkdown, renderReferenceJson } from "@/lib/entity-reference/render";
import type { EntityReference } from "@/lib/entity-reference/types";

/**
 * Radix DropdownMenu opens on pointer events (pointerdown), which jsdom does
 * not synthesize from a plain `click`. This helper drives the trigger the way
 * a real browser would, and stubs the pointer-capture APIs jsdom lacks.
 */
function openMenu() {
  const trigger = screen.getByRole("button", { name: /copy reference/i });
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
  fireEvent.pointerUp(trigger, { button: 0, pointerId: 1 });
}

// The renderers are the single source of truth for the payload strings; the
// button just calls them. Spy on them so the test verifies the component
// delegates rather than re-implementing formatting.
vi.mock("@/lib/entity-reference/render", () => ({
  renderReferenceMarkdown: vi.fn(() => "MOCK-MARKDOWN-PREVIEW"),
  renderReferenceJson: vi.fn(() => "MOCK-JSON-PREVIEW"),
}));

// `copyText` is the clipboard utility the component wires up (task 3.3).
// Default to a successful copy; individual tests override this to simulate
// the fallback path.
const copyTextMock = vi.fn<(text: string) => Promise<{ ok: boolean; fallback: boolean }>>(
  async () => ({ ok: true, fallback: false }),
);
vi.mock("@/lib/clipboard", () => ({
  copyText: (text: string) => copyTextMock(text),
}));

const reference: EntityReference = {
  type: "task",
  id: "task-42",
  title: "Implement thing",
  path: "/repo/openspec/changes/add/tasks.md",
  readInstruction: "Read tasks.md and implement task 2.",
  metadata: { status: "in-progress" },
  generatedAt: "2026-06-19T00:00:00.000Z",
};

describe("CopyReferenceButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copyTextMock.mockResolvedValue({ ok: true, fallback: false });
    // jsdom lacks pointer-capture APIs that Radix calls during open/close.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture = vi.fn(() => false);
    proto.setPointerCapture = vi.fn();
    proto.releasePointerCapture = vi.fn();
    // Ensure a working async clipboard for copy-by-default assertions.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a trigger control labelled Copy reference", () => {
    render(<CopyReferenceButton reference={reference} />);
    expect(
      screen.getByRole("button", { name: /copy reference/i }),
    ).toBeTruthy();
  });

  it("opens a dropdown with Markdown and JSON format options and a live preview", () => {
    render(<CopyReferenceButton reference={reference} />);

    openMenu();

    // Two format menu items.
    expect(screen.getByRole("menuitem", { name: /markdown/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /json/i })).toBeTruthy();

    // Live preview rendered as a textarea, seeded from the active (default)
    // format's renderer.
    const preview = screen.getByLabelText(/preview/i) as HTMLTextAreaElement;
    expect(preview.tagName).toBe("TEXTAREA");
  });

  it("seeds the preview by calling the markdown renderer by default", () => {
    render(<CopyReferenceButton reference={reference} />);

    openMenu();

    expect(renderReferenceMarkdown).toHaveBeenCalledWith(reference);
    const preview = screen.getByLabelText(/preview/i) as HTMLTextAreaElement;
    expect(preview.value).toBe("MOCK-MARKDOWN-PREVIEW");
  });

  it("switches the preview payload when the JSON format is selected", () => {
    render(<CopyReferenceButton reference={reference} />);

    openMenu();

    // Select JSON format.
    fireEvent.click(screen.getByRole("menuitem", { name: /json/i }));

    expect(renderReferenceJson).toHaveBeenCalledWith(reference);
    const preview = screen.getByLabelText(/preview/i) as HTMLTextAreaElement;
    expect(preview.value).toBe("MOCK-JSON-PREVIEW");
  });

  it("exposes a copy control that calls copyText with the rendered payload", async () => {
    render(<CopyReferenceButton reference={reference} />);

    openMenu();

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledTimes(1);
    });
    expect(copyTextMock).toHaveBeenCalledWith("MOCK-MARKDOWN-PREVIEW");
  });

  it("switches the preview textarea to selectable mode and shows a manual-copy hint when copyText reports fallback", async () => {
    copyTextMock.mockResolvedValue({ ok: false, fallback: true });
    render(<CopyReferenceButton reference={reference} />);

    openMenu();

    // Before copy, the preview is read-only.
    const previewBefore = screen.getByLabelText(/preview/i) as HTMLTextAreaElement;
    expect(previewBefore.readOnly).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    // After the fallback, the preview is selectable (no longer readOnly) and
    // a manual-copy hint is shown.
    await waitFor(() => {
      const previewAfter = screen.getByLabelText(/preview/i) as HTMLTextAreaElement;
      expect(previewAfter.readOnly).toBe(false);
    });
    expect(
      screen.getByText(/select all.*⌘c/i),
    ).toBeTruthy();
  });

  // --- Task 3.4: transient confirmation state -----------------------------

  it("shows an inline 'Copied' confirmation after a successful copy", async () => {
    copyTextMock.mockResolvedValue({ ok: true, fallback: false });
    render(<CopyReferenceButton reference={reference} />);

    openMenu();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    });

    expect(screen.getByText(/copied/i)).toBeTruthy();
  });

  it("auto-dismisses the 'Copied' confirmation within 4 seconds", async () => {
    vi.useFakeTimers();
    try {
      copyTextMock.mockResolvedValue({ ok: true, fallback: false });
      render(<CopyReferenceButton reference={reference} />);

      openMenu();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
        await vi.runAllTicks();
      });
      // Confirmation is visible right after a successful copy.
      expect(screen.getByText(/copied/i)).toBeTruthy();

      // Spec: auto-dismisses within 4 seconds. Advance fake timers; the
      // transient confirmation MUST clear by the 4s mark.
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByText(/copied/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never shows a 'Copied' confirmation on a fallback failure and indicates manual copy", async () => {
    copyTextMock.mockResolvedValue({ ok: false, fallback: true });
    render(<CopyReferenceButton reference={reference} />);

    openMenu();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    });

    // Must NOT claim success.
    expect(screen.queryByText(/^copied$/i)).toBeNull();
    // Must surface the manual-copy path (status + button).
    expect(screen.getByRole("button", { name: /manual copy/i })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
