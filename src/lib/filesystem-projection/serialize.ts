/**
 * Task 1.8 — Markdown projection serializers.
 *
 * Project the Task 1.7 in-memory model back to upstream OpenSpec Markdown.
 * A `parse → serialize → parse` round-trip yields a structurally equivalent
 * model (source `line` numbers are positional metadata and may shift; the
 * semantic content is preserved).
 *
 * Spec source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "Filesystem projection with
 * atomic writes"; req 01 §1.4, INV-7).
 */
import type {
  DeltaPlan,
  MainSpecModel,
  RequirementBlock,
  Scenario,
  TaskItem,
} from "@/lib/openspec-parser/types";

// ─── tasks ──────────────────────────────────────────────────────────────────

/** Indentation unit for nested checkbox lines (matches upstream tasks.md). */
const TASK_INDENT = "  ";

function renderTask(item: TaskItem, depth: number): string {
  const indent = TASK_INDENT.repeat(depth);
  return `${indent}- ${item.marker} ${item.label}`;
}

function renderTasks(items: TaskItem[], depth: number, out: string[]): void {
  for (const item of items) {
    out.push(renderTask(item, depth));
    if (item.children.length > 0) renderTasks(item.children, depth + 1, out);
  }
}

/** Serialize a list of task items back to upstream `tasks.md` Markdown. */
export function serializeTasks(items: TaskItem[]): string {
  const out: string[] = [];
  renderTasks(items, 0, out);
  return out.join("\n") + (out.length > 0 ? "\n" : "");
}

// ─── requirement blocks ─────────────────────────────────────────────────────

function renderScenario(scenario: Scenario): string[] {
  const out: string[] = [`#### Scenario: ${scenario.name}`];
  if (scenario.body.trim().length > 0) {
    out.push(scenario.body.trim());
  }
  return out;
}

function renderRequirement(req: RequirementBlock): string[] {
  const out: string[] = [`### Requirement: ${req.name}`];
  if (req.body.trim().length > 0) {
    out.push(req.body.trim());
  }
  for (const scenario of req.scenarios) {
    out.push(...renderScenario(scenario));
  }
  return out;
}

function renderRequirementBlock(
  header: string,
  reqs: RequirementBlock[],
): string | null {
  if (reqs.length === 0) return null;
  const out: string[] = [header, ""];
  for (const req of reqs) {
    out.push(...renderRequirement(req));
    out.push("");
  }
  return out.join("\n");
}

// ─── main spec ──────────────────────────────────────────────────────────────

/**
 * Serialize a main spec model back to upstream `spec.md` Markdown. Emits the
 * canonical `## Requirements` section followed by each requirement block.
 */
export function serializeMainSpec(model: MainSpecModel): string {
  const out: string[] = [`# ${model.capability} Specification`, "", "## Requirements", ""];
  for (const req of model.requirements) {
    out.push(...renderRequirement(req));
    out.push("");
  }
  return out.join("\n") + "\n";
}

// ─── delta spec ─────────────────────────────────────────────────────────────

/**
 * Serialize a delta plan back to upstream delta-spec Markdown, emitting only
 * the verb sections that are present (matching `plan.sectionPresence`).
 */
export function serializeDeltaSpec(plan: DeltaPlan): string {
  const sections: string[] = [];

  if (plan.sectionPresence.added || plan.added.length > 0) {
    const block = renderRequirementBlock("## ADDED Requirements", plan.added);
    if (block) sections.push(block);
  }
  if (plan.sectionPresence.modified || plan.modified.length > 0) {
    const block = renderRequirementBlock("## MODIFIED Requirements", plan.modified);
    if (block) sections.push(block);
  }
  if (plan.sectionPresence.removed || plan.removed.length > 0) {
    const out: string[] = ["## REMOVED Requirements", ""];
    for (const name of plan.removed) {
      out.push(`### Requirement: ${name}`, "");
    }
    sections.push(out.join("\n"));
  }
  if (plan.sectionPresence.renamed || plan.renamed.length > 0) {
    const out: string[] = ["## RENAMED Requirements", ""];
    for (const { from, to } of plan.renamed) {
      out.push(`### Requirement: ${from}`, "to", `### Requirement: ${to}`, "");
    }
    sections.push(out.join("\n"));
  }

  return sections.join("\n") + (sections.length > 0 ? "\n" : "");
}
