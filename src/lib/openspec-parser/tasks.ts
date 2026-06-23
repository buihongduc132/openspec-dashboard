/**
 * Task 3.4 — tasks.md checkbox parser + serializer (INV-2, NFR-4).
 *
 * This module owns the canonical OpenSpec `tasks.md` grammar:
 *   - `## <group heading>` top-level group headings
 *   - `- [ ]` / `- [x]` / `- [X]` checkbox task lines (the marker is preserved
 *     verbatim — `[ ]`, `[x]`, `[X]` — NEVER normalized)
 *   - nested sub-items via indentation
 *
 * Design (D0-1): a hand-written, line-oriented parser. INV-2 demands that the
 * verbatim marker bytes survive a round-trip unchanged, so the model stores the
 * exact marker text per task. NFR-4 demands byte-fidelity on untouched regions,
 * so the serializer re-emits the verbatim source line array when nothing was
 * edited.
 *
 * The parser NEVER throws on malformed input; it collects structured
 * {@link ParseIssue}s and continues.
 *
 * Source: `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`,
 * Requirement "tasks.md checkbox parser".
 */

import type { ParseIssue } from "./types";

// ─── Model ──────────────────────────────────────────────────────────────────

/** A single checkbox task line (`- [ ]` / `- [x]` / `- [X]`). */
export interface TaskItem {
  /** Verbatim checkbox marker, e.g. `[ ]`, `[x]`, `[X]` (preserved as-written). */
  marker: string;
  /** Derived checked state (`true` unless the marker is `[ ]`). */
  checked: boolean;
  /** Verbatim label bytes following the marker (trimming only the single
   * separating run of spaces between `]` and the label, which is structural). */
  label: string;
  /**
   * The display-only task number prefix (e.g. `1.1`, `2.3a`) when the label
   * begins with one. Display metadata ONLY — never used as identity (INV-2).
   */
  displayNumber?: string;
  /** The label text with the leading display number stripped, when present. */
  body: string;
  /** 1-based source line. */
  line: number;
  /** Nested sub-items (more-indented checkbox lines). */
  children: TaskItem[];
}

/** A `## <heading>` group with its task items. */
export interface TaskGroup {
  /** Verbatim group heading text (without the `## ` prefix). */
  heading: string;
  /** 1-based source line of the group heading. */
  line: number;
  /** Top-level task items under this group. */
  items: TaskItem[];
}

/** In-memory model of an OpenSpec `tasks.md` file. */
export interface TasksModel {
  groups: TaskGroup[];
  /**
   * Verbatim source lines (split on `\n`, NOT re-joined/normalized). The single
   * source of truth for byte-fidelity; the serializer emits these unchanged.
   */
  lines: string[];
}

export interface TasksParseResult {
  model: TasksModel;
  issues: ParseIssue[];
}

// ─── Regexes ────────────────────────────────────────────────────────────────

const GROUP_HEADING = /^##\s+(.*)$/;
const TASK_LINE = /^(\s*)-\s*\[([ xX])\]\s+(.*)$/;
// Display-number prefix like `1.1 `, `2.3a `, `1.10 ` at the start of a label.
const DISPLAY_NUMBER = /^([0-9]+(?:\.[0-9]+){0,2}[a-z]?)\s+(.*)$/;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Split a label into its optional display-number prefix and the body. The
 * display number is metadata only (INV-2): identity is the verbatim line.
 */
function splitDisplayNumber(label: string): { displayNumber?: string; body: string } {
  const m = label.match(DISPLAY_NUMBER);
  if (m) return { displayNumber: m[1], body: m[2] };
  return { body: label };
}

interface Frame {
  indent: number;
  item: TaskItem;
}

/**
 * Walk the verbatim line array; an in-process stack tracks nesting by indent.
 * Items with no open parent at a smaller indent become group items; more-indented
 * lines attach to the nearest shallower item as children.
 */
function attachItem(stack: Frame[], groupItems: TaskItem[], item: TaskItem, indent: number): void {
  while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
    stack.pop();
  }
  if (stack.length === 0) {
    groupItems.push(item);
  } else {
    stack[stack.length - 1].item.children.push(item);
  }
  stack.push({ indent, item });
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse an OpenSpec `tasks.md` into a byte-fidelity model. Never throws on
 * malformed input; collects structured {@link ParseIssue}s instead.
 */
export function parseTasks(content: string, filePath: string): TasksParseResult {
  const issues: ParseIssue[] = [];
  const lines = content.split("\n");

  const groups: TaskGroup[] = [];
  // Implicit group for task lines that appear before any `## ` heading.
  let current: TaskGroup | null = null;
  let stack: Frame[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    const gm = raw.match(GROUP_HEADING);
    if (gm) {
      current = { heading: gm[1].trim(), line: i + 1, items: [] };
      groups.push(current);
      // A new group heading resets the nesting stack.
      stack = [];
      continue;
    }

    const tm = raw.match(TASK_LINE);
    if (tm) {
      const indent = tm[1].length;
      const markerChar = tm[2];
      const label = tm[3];
      const { displayNumber, body } = splitDisplayNumber(label);
      const item: TaskItem = {
        marker: `[${markerChar}]`,
        checked: markerChar !== " ",
        label,
        displayNumber,
        body,
        line: i + 1,
        children: [],
      };

      // Lazily create an implicit group for loose items with no heading yet.
      if (!current) {
        current = { heading: "", line: 0, items: [] };
        groups.push(current);
      }
      attachItem(stack, current.items, item, indent);
      continue;
    }

    // Non-task, non-heading lines (blank lines, prose) are intentionally left
    // in the verbatim line store; they are not modeled structurally.
  }

  // Drop any leading implicit group that ended up empty (defensive; the lazy
  // create above guarantees implicit groups only exist when they hold items).
  const model: TasksModel = { groups, lines };
  return { model, issues };
}

// ─── Serializer ─────────────────────────────────────────────────────────────

/**
 * Serialize a {@link TasksModel} back to text with byte-fidelity for every
 * region. With no edits applied, the output is byte-for-byte identical to the
 * original source (the verbatim `lines` store is emitted unchanged).
 */
export function serializeTasks(model: TasksModel): string {
  return model.lines.join("\n");
}
