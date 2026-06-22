/**
 * Task 4.5 — Schema authoring: template management (req 05 §5.6).
 *
 *  - 05.6 AC (a): Template variable autocomplete — surface the set of
 *    variables (`{{name}}`, `{{context.*}}`, `{{date}}`) referenced in a
 *    template body.
 *  - 05.6 AC (b): Preview uses the current project's context block to render
 *    the template with sample variables injected.
 */
import { describe, it, expect } from "vitest";
import {
  extractTemplateVariables,
  renderTemplate,
  type TemplateContext,
} from "@/lib/schemas/templates";

describe("extractTemplateVariables (05.6 a)", () => {
  it("collects {{name}}, {{date}}, and {{context.*}} variables", () => {
    const vars = extractTemplateVariables(
      "# {{name}}\n\nDate: {{date}}\nProject: {{context.project.name}}\n",
    );
    expect(vars).toEqual(expect.arrayContaining(["name", "date", "context.project.name"]));
  });

  it("deduplicates variables and ignores mustache whitespace variants", () => {
    const vars = extractTemplateVariables("{{ name }} and {{name}} and {{date}}");
    expect(vars).toEqual(["name", "date"]);
  });

  it("returns an empty list when the template has no variables", () => {
    expect(extractTemplateVariables("# Plain Markdown\n")).toEqual([]);
  });
});

describe("renderTemplate (05.6 b)", () => {
  const ctx: TemplateContext = {
    name: "add-login",
    date: "2026-06-22",
    context: {
      project: { name: "Dashboard", owner: "bhd" },
    },
  };

  it("substitutes top-level variables and context.* paths", () => {
    const out = renderTemplate(
      "# {{name}} ({{date}})\nProject: {{context.project.name}}\n",
      ctx,
    );
    expect(out).toBe("# add-login (2026-06-22)\nProject: Dashboard\n");
  });

  it("leaves unknown variables as-is (no crash, no silent drop)", () => {
    const out = renderTemplate("Hello {{unknown}} {{name}}", ctx);
    expect(out).toBe("Hello {{unknown}} add-login");
  });

  it("handles missing context paths gracefully by leaving the tag", () => {
    const out = renderTemplate("Owner: {{context.project.missing}}", ctx);
    expect(out).toBe("Owner: {{context.project.missing}}");
  });

  it("treats whitespace inside mustache tags as equivalent (renders {{ name }} too)", () => {
    const out = renderTemplate("{{ name }}", ctx);
    expect(out).toBe("add-login");
  });
});
