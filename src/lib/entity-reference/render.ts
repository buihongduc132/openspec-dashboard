/**
 * Renderers for entity reference payloads (D4).
 *
 * Two pure presentation functions produce copy-ready strings from a single
 * canonical `EntityReference` object:
 *  - `renderReferenceJson(ref)`  -> a single valid JSON object (no prose)
 *  - `renderReferenceMarkdown(ref)` -> a fenced markdown block for chat
 *
 * The object (built by `buildEntityReference`) is the single source of truth;
 * these renderers are pure presentation so a future format (YAML, shell) is
 * purely additive.
 */

import type { EntityReference } from "@/lib/entity-reference/types";

/**
 * Render a reference payload as a single valid JSON object with no trailing
 * prose. The output round-trips: `JSON.parse(renderReferenceJson(ref))` equals
 * the source `ref`.
 */
export function renderReferenceJson(ref: EntityReference): string {
  return JSON.stringify(ref, null, 2);
}

/**
 * Render a reference payload as a fenced markdown block suitable for pasting
 * into chat. Includes the entity type as a heading, the title, a metadata
 * list, the absolute path, and the read instruction as plain text.
 */
export function renderReferenceMarkdown(ref: EntityReference): string {
  const lines: string[] = [];

  lines.push(`# ${ref.type}: ${ref.title}`);
  lines.push("");
  lines.push(`- **id**: ${ref.id}`);

  if (Object.keys(ref.metadata).length > 0) {
    for (const [key, value] of Object.entries(ref.metadata)) {
      lines.push(`- **${key}**: ${formatMetadataValue(value)}`);
    }
  }

  lines.push("");
  lines.push(`**Path**: ${ref.path}`);
  lines.push("");
  lines.push(`**Read instruction**: ${ref.readInstruction}`);
  lines.push("");
  lines.push(`_Generated: ${ref.generatedAt}_`);

  return "```markdown\n" + lines.join("\n") + "\n```";
}

/**
 * Format a scalar metadata value for display in the markdown list.
 * Dates are rendered as ISO-8601 strings to stay lossless.
 */
function formatMetadataValue(
  value: string | number | boolean | Date,
): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}
