import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyText } from "@/lib/clipboard";

describe("copyText", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    // Clean any leftover fallback textareas
    document.body.innerHTML = "";
  });

  afterEach(() => {
    // Restore clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    document.body.innerHTML = "";
  });

  function mockClipboard(writeTextImpl: (t: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(writeTextImpl) },
      configurable: true,
      writable: true,
    });
  }

  function removeClipboard() {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }

  it("returns { ok: true, fallback: false } when clipboard API succeeds", async () => {
    mockClipboard(async () => {});
    const result = await copyText("hello");
    expect(result).toEqual({ ok: true, fallback: false });
    // No fallback textarea should be rendered
    const ta = document.body.querySelector("textarea");
    expect(ta).toBeNull();
  });

  it("writes the provided text via navigator.clipboard.writeText on success", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    await copyText("payload-text");
    expect(writeText).toHaveBeenCalledWith("payload-text");
  });

  it("falls back to textarea when clipboard API is undefined", async () => {
    removeClipboard();
    const result = await copyText("fallback-payload");
    expect(result).toEqual({ ok: false, fallback: true });

    const ta = document.body.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();
    expect(ta!.value).toBe("fallback-payload");
    // The textarea should be the active (focused) element
    expect(document.activeElement).toBe(ta);
    // Selection should cover the full contents
    expect(ta!.selectionStart).toBe(0);
    expect(ta!.selectionEnd).toBe("fallback-payload".length);
  });

  it("falls back to textarea when clipboard.writeText rejects", async () => {
    mockClipboard(async () => {
      throw new Error("denied");
    });
    const result = await copyText("rejected-payload");
    expect(result).toEqual({ ok: false, fallback: true });

    const ta = document.body.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();
    expect(ta!.value).toBe("rejected-payload");
    expect(document.activeElement).toBe(ta);
    expect(ta!.selectionStart).toBe(0);
    expect(ta!.selectionEnd).toBe("rejected-payload".length);
  });

  it("marks fallback textarea so it can be styled/hidden as an overlay", async () => {
    removeClipboard();
    await copyText("x");
    const ta = document.body.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();
    // Use a data attribute so consumers can identify the fallback element
    expect(ta!.getAttribute("data-copy-fallback")).toBe("true");
  });
});
