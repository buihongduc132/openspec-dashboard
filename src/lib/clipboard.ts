/**
 * Clipboard + toast utilities.
 *
 * `copyText(text)` attempts the async Clipboard API
 * (`navigator.clipboard.writeText`). When it is unavailable or rejects, it
 * falls back to a hidden, focusable, fully-selected `<textarea>` so the user
 * can complete the copy manually (per design D6 and the spec's
 * "Clipboard fallback" requirement).
 *
 * It never throws: callers receive a `{ ok, fallback }` result and decide how
 * to surface the outcome (toast / inline state).
 */

/** Outcome of a {@link copyText} call. */
export interface CopyResult {
  /** `true` when the text was written to the clipboard automatically. */
  ok: boolean;
  /** `true` when the textarea fallback path was taken. */
  fallback: boolean;
}

/**
 * Read-only fallback position; the textarea is visible-enough to focus/select
 * but visually unobtrusive. We keep it in the DOM so the consuming component
 * (CopyReferenceButton) can react to `fallback: true` and re-mount its own
 * selectable preview.
 */
const FALLBACK_TEXTAREA_STYLE = [
  "position:fixed",
  "top:0",
  "left:0",
  "width:1px",
  "height:1px",
  "padding:0",
  "border:0",
  "margin:0",
  "opacity:0",
  "outline:none",
  "box-shadow:none",
].join(";");

/**
 * Renders the payload into a focused+selected fallback textarea so the user
 * can press the platform copy shortcut.
 *
 * Returns the created element (handy for tests / consumers that want to clean
 * it up). Never throws.
 */
export function renderFallbackTextarea(text: string): HTMLTextAreaElement {
  if (typeof document === "undefined") {
    // SSR / non-DOM environments: nothing to render. Callers should still
    // treat the result as `fallback: true`.
    throw new Error("renderFallbackTextarea requires a DOM environment");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  // Mark so consumers/tests can locate the fallback element.
  textarea.setAttribute("data-copy-fallback", "true");
  textarea.setAttribute("aria-label", "Copy this text manually");
  textarea.style.cssText = FALLBACK_TEXTAREA_STYLE;

  document.body.appendChild(textarea);

  // Focus + select so the platform copy shortcut captures the contents.
  // `setSelectionRange` is the most reliable cross-environment way (jsdom
  // honors it; `select()` is not always honored in jsdom).
  textarea.focus({ preventScroll: true });
  try {
    textarea.setSelectionRange(0, text.length);
  } catch {
    // Some environments throw when the textarea is not yet focusable; fall
    // back to select() which is the legacy API.
    try {
      textarea.select();
    } catch {
      // Give up silently — never throw from a clipboard util.
    }
  }

  return textarea;
}

/**
 * Copy text to the clipboard, falling back to a focusable+selected textarea
 * when the async Clipboard API is unavailable or rejected.
 *
 * @returns `{ ok, fallback }` — never throws.
 */
export async function copyText(text: string): Promise<CopyResult> {
  // Prefer the modern async Clipboard API.
  const clipboard =
    typeof navigator !== "undefined" ? navigator.clipboard : undefined;

  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return { ok: true, fallback: false };
    } catch {
      // Rejected (permission denied, insecure context, etc.) → fall through.
    }
  }

  // Fallback path: render a focused + selected textarea for manual copy.
  renderFallbackTextarea(text);
  return { ok: false, fallback: true };
}
