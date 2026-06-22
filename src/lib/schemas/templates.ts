/**
 * Task 4.5 — Schema authoring: template management (req 05 §5.6).
 *
 *  - 05.6 AC (a): Template variable autocomplete — extract the set of
 *    `{{name}}`, `{{date}}`, `{{context.*}}` variables referenced in a
 *    template body.
 *  - 05.6 AC (b): Preview rendering uses the current project's context block
 *    to inject sample variables into the template.
 *
 * The substitution grammar is the minimal mustache subset used by OpenSpec
 * schema templates: `{{ var.path }}` with optional inner whitespace. Unknown
 * variables are left intact (never silently dropped) so authors can spot
 * typos.
 *
 * Source: `flow/requirements/05-schemas.md` §5.6.
 */

/** Variables available to a template during preview rendering. */
export interface TemplateContext {
  [key: string]: unknown;
}

const TAG = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Extract the ordered, de-duplicated list of variable references in a
 * template body (05.6 AC a). Returns simple dotted paths like
 * `name`, `date`, `context.project.name`.
 */
export function extractTemplateVariables(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(TAG)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Resolve a dotted path against a context object. Returns `undefined` when
 * any segment is missing.
 */
function lookup(ctx: TemplateContext, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Render a template body by substituting known variables from the context
 * (05.6 AC b). Unknown variables are left as-is so the author sees them.
 */
export function renderTemplate(
  body: string,
  ctx: TemplateContext,
): string {
  return body.replace(TAG, (full, name: string) => {
    const value = lookup(ctx, name);
    if (value === undefined) return full;
    return String(value);
  });
}
