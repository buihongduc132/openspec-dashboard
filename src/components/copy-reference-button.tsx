"use client";

/**
 * CopyReferenceButton — single control that opens a Radix DropdownMenu
 * exposing both reference formats (markdown + JSON) with a live preview of
 * the rendered payload (design D7).
 *
 * Scope (task 3.2): holds a `format` state (markdown | json), renders the
 * dropdown trigger + two format menu items + a read-only preview textarea
 * seeded by `renderReferenceMarkdown` / `renderReferenceJson`. Clipboard
 * fallback wiring (3.3) and transient confirmation state (3.4) are layered
 * on by subsequent tasks.
 */

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  renderReferenceMarkdown,
  renderReferenceJson,
} from "@/lib/entity-reference/render";
import { copyText } from "@/lib/clipboard";
import type { EntityReference } from "@/lib/entity-reference/types";

/** Copy payload formats offered by the control. */
export type ReferenceFormat = "markdown" | "json";

export interface CopyReferenceButtonProps {
  /** Canonical reference payload to render + copy. */
  reference: EntityReference;
  /** Optional className for the trigger (e.g. icon-only sizing on list rows). */
  className?: string;
  /**
   * Compact icon-only variant for dense list rows (task 4.5). When true the
   * trigger renders only the copy glyph (no inline "Copy reference" label);
   * the label stays reachable to assistive tech via `aria-label`. The dropdown
   * content (formats + preview) is unchanged.
   */
  iconOnly?: boolean;
}

/** Render the payload string for the active format. Pure presentation. */
function renderPayload(
  format: ReferenceFormat,
  reference: EntityReference,
): string {
  return format === "json"
    ? renderReferenceJson(reference)
    : renderReferenceMarkdown(reference);
}

/** Copy outcome surfaced inside the dropdown (task 3.3 fallback wiring). */
type CopyState = "idle" | "copied" | "fallback";

export function CopyReferenceButton({
  reference,
  className,
  iconOnly = false,
}: CopyReferenceButtonProps) {
  const [format, setFormat] = React.useState<ReferenceFormat>("markdown");
  const [open, setOpen] = React.useState(false);
  // `fallback` switches the preview textarea from read-only preview into
  // selectable mode so the user can copy manually when the Clipboard API is
  // unavailable (spec: Clipboard fallback). The transient `copied` state
  // drives the auto-dismissing "Copied" inline label (spec: Copy
  // confirmation).
  const [copyState, setCopyState] = React.useState<CopyState>("idle");
  const previewRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Auto-dismiss the "Copied" confirmation. The spec requires the transient
  // state to clear within 4 seconds; clearing it just under the cap keeps the
  // feedback snappy without violating the ceiling.
  const DISMISS_MS = 4000;
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (copyState !== "copied") return;
    dismissTimer.current = setTimeout(() => {
      setCopyState("idle");
    }, DISMISS_MS);
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [copyState]);

  // The preview is derived from state + props; recompute on every render so
  // it stays live even when the underlying reference changes.
  const preview = renderPayload(format, reference);

  async function handleCopy() {
    const result = await copyText(preview);
    if (result.fallback) {
      // Fallback path: make the preview selectable and focus + select it so
      // the platform copy shortcut captures the payload.
      setCopyState("fallback");
      const textarea = previewRef.current;
      if (textarea) {
        textarea.focus({ preventScroll: true });
        try {
          textarea.setSelectionRange(0, preview.length);
        } catch {
          textarea.select();
        }
      }
    } else {
      setCopyState(result.ok ? "copied" : "fallback");
    }
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? "icon" : "sm"}
          className={cn(iconOnly && "h-7 w-7", className)}
          aria-label="Copy reference"
        >
          <Copy aria-hidden="true" />
          {!iconOnly && <span>Copy reference</span>}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 w-80 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Label className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Copy as
          </DropdownMenu.Label>

          <DropdownMenu.Item
            onSelect={(event) => {
              // Keep the menu open so the live preview updates in place.
              event.preventDefault();
              setFormat("markdown");
            }}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground",
              format === "markdown" && "font-semibold",
            )}
          >
            Markdown
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={(event) => {
              event.preventDefault();
              setFormat("json");
            }}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground",
              format === "json" && "font-semibold",
            )}
          >
            JSON
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <label className="block px-1">
            <span className="sr-only">Preview</span>
            <textarea
              ref={previewRef}
              aria-label="Preview"
              readOnly={copyState !== "fallback"}
              value={preview}
              className="h-32 w-full resize-none rounded border border-input bg-background p-2 font-mono text-xs"
            />
            {copyState === "fallback" && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Select all + ⌘C
              </span>
            )}
          </label>

          <Button
            type="button"
            size="sm"
            className="mt-2 w-full"
            onClick={handleCopy}
          >
            <Copy aria-hidden="true" />
            <span>{copyState === "fallback" ? "Manual copy" : "Copy"}</span>
          </Button>

          {copyState === "copied" && (
            <span
              role="status"
              aria-live="polite"
              className="mt-1 block text-center text-xs font-medium text-emerald-600"
            >
              Copied
            </span>
          )}
          {copyState === "fallback" && (
            <span
              role="status"
              aria-live="polite"
              className="mt-1 block text-center text-xs font-medium text-amber-600"
            >
              Manual copy: use the selected text
            </span>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
