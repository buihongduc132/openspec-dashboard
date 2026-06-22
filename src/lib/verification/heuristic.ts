/**
 * Task 4.6 — Heuristic verifier (req 06 §6.1).
 *
 * Pure TypeScript keyword/AST engine implementing the three heuristic
 * dimensions of `/opsx:verify`-inspired verification (design D5):
 *
 *  - **Completeness** — unchecked tasks; ADDED/MODIFIED requirements without
 *    scenarios; ADDED/MODIFIED requirements without any implementing task.
 *  - **Correctness**  — keyword overlap between task prose and requirement /
 *    scenario intent; scenario Given/When/Then verbs echoed in task prose.
 *  - **Coherence**    — design.md decision keywords reflected in delta specs
 *    or tasks; design decisions without implementing tasks flagged.
 *
 * The verifier is advisory by default (req 06 §6.1 AC c). Output is a findings
 * list with severity CRITICAL / WARNING / SUGGESTION, each linked to the
 * offending artifact + line (req 06 §6.1 AC a). The LLM tier (06.1d) is
 * deferred to Phase 3b.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.1 + design D5.
 */

import type { ChangeModel, RequirementBlock, TaskItem } from "@/lib/openspec-parser";
import type {
  HeuristicReport,
  VerifierFinding,
  VerifierSeverity,
} from "@/lib/verification/types";

/** Words ignored by the keyword overlap heuristic (too generic to signal intent). */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "by",
  "is", "are", "be", "shall", "must", "should", "may", "will", "this", "that",
  "it", "as", "at", "from", "into", "each", "every", "all", "any", "new",
  "system", "dashboard", "user", "users", "via", "per", "when", "then", "given",
  "and", "but", "not", "so", "if", "they", "their", "its", "has", "have",
]);

/** RFC 2119 Given/When/Then bullet marker inside a scenario body. */
const GWT_BULLET = /^\s*-\s+\*\*(GIVEN|WHEN|THEN)\*\*\s*(.*)$/i;

/** Decision header in design.md — `### D1: Title` or `## Decision: Title`. */
const DECISION_HEADER = /^\s*#{2,4}\s+(D\d+|Decision)\s*[:\-]\s*(.+?)\s*$/i;

/**
 * Tokenize prose into a set of significant lowercase keywords (stop words and
 * very short tokens removed). Used by every overlap check so that the
 * rationale string can reference the shared vocabulary.
 */
export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOP_WORDS.has(raw)) out.add(raw);
  }
  return out;
}

/** Recursively flatten a task tree into a flat list (visits children). */
function flattenTasks(items: TaskItem[]): TaskItem[] {
  const out: TaskItem[] = [];
  for (const t of items) {
    out.push(t);
    if (t.children.length) out.push(...flattenTasks(t.children));
  }
  return out;
}

/** Non-zero overlap between two keyword sets. */
function overlaps(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const k of small) if (large.has(k)) return true;
  return false;
}

/** Requirement intent keywords = name + body keywords. */
function requirementKeywords(req: RequirementBlock): Set<string> {
  return union(keywords(req.name), keywords(req.body));
}

function union(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a, ...b]);
}

/** Build the union of all task prose keywords (the "implemented intent"). */
function taskKeywordUnion(tasks: TaskItem[]): Set<string> {
  const flat = flattenTasks(tasks);
  if (flat.length === 0) return new Set();
  const sets = flat.map((t) => keywords(t.label));
  return sets.reduce((acc, s) => union(acc, s), new Set<string>());
}

/** Extract decision headers `{ line, title, keywords }` from design.md. */
interface DesignDecision {
  line: number;
  title: string;
  keywords: Set<string>;
}

function extractDecisions(design: string | undefined): DesignDecision[] {
  if (!design) return [];
  const lines = design.split("\n");
  const out: DesignDecision[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DECISION_HEADER);
    if (m) {
      const title = m[2].trim();
      out.push({ line: i + 1, title, keywords: keywords(title) });
    }
  }
  return out;
}

/** Reconstruct the artifact path the parser would have stored. */
function deltaArtifactPath(domain: string): string {
  return `specs/${domain}/spec.md`;
}

/**
 * Run the heuristic verification pass on a single parsed change (req 06 §6.1).
 *
 * Determinism: findings are emitted sorted by `(dimension, ruleId, line)` so
 * the report is reproducible regardless of input map iteration order.
 */
export function verifyChangeHeuristic(change: ChangeModel): HeuristicReport {
  const findings: VerifierFinding[] = [];

  const tasks = flattenTasks(change.tasks.items);
  const taskKw = taskKeywordUnion(change.tasks.items);

  // ── Completeness ──────────────────────────────────────────────────────────

  // Unchecked tasks (WARNING) — every task should eventually be completed.
  for (const t of tasks) {
    if (!t.checked) {
      findings.push({
        dimension: "completeness",
        ruleId: "completeness.unchecked-task",
        severity: "WARNING",
        artifact: "tasks.md",
        line: t.line,
        message: `Task is not checked: "${t.label}".`,
        rationale:
          "Completeness check: outstanding (unchecked) tasks indicate the change is not yet finished.",
      });
    }
  }

  // ADDED / MODIFIED requirements must have scenarios and an implementing task.
  for (const [domain, delta] of Object.entries(change.deltaSpecs)) {
    const artifact = deltaArtifactPath(domain);
    for (const req of [...delta.plan.added, ...delta.plan.modified]) {
      if (req.scenarios.length === 0) {
        findings.push({
          dimension: "completeness",
          ruleId: "completeness.requirement-no-scenarios",
          severity: "CRITICAL",
          artifact,
          line: req.line,
          message: `Requirement "${req.name}" has no scenarios.`,
          rationale:
            "Completeness check: every ADDED/MODIFIED requirement must have at least one acceptance scenario.",
        });
      }

      const reqKw = requirementKeywords(req);
      if (!overlaps(reqKw, taskKw)) {
        findings.push({
          dimension: "completeness",
          ruleId: "completeness.requirement-no-task",
          severity: "CRITICAL",
          artifact,
          line: req.line,
          message: `Requirement "${req.name}" has no implementing task.`,
          rationale:
            "Completeness check (keyword overlap): no task prose shares significant keywords with the requirement name/body.",
        });
      }
    }
  }

  // ── Correctness (heuristic) ───────────────────────────────────────────────

  // Scenario Given/When/Then intent should be echoed by at least one task.
  for (const [domain, delta] of Object.entries(change.deltaSpecs)) {
    const artifact = deltaArtifactPath(domain);
    for (const req of [...delta.plan.added, ...delta.plan.modified]) {
      for (const sc of req.scenarios) {
        const scenarioKw = scenarioIntentKeywords(sc.body);
        // Require at least one task to echo the scenario's intent keywords.
        if (scenarioKw.size > 0 && !overlaps(scenarioKw, taskKw)) {
          findings.push({
            dimension: "correctness",
            ruleId: "correctness.scenario-not-echoed",
            severity: "SUGGESTION",
            artifact,
            line: sc.line,
            message: `Scenario "${sc.name}" intent is not echoed by any task.`,
            rationale:
              "Correctness heuristic: scenario Given/When/Then verbs share no significant keywords with task prose. Best-effort; may be a false positive.",
          });
        }
      }
    }
  }

  // ── Coherence (heuristic) ─────────────────────────────────────────────────

  const decisions = extractDecisions(change.artifacts.design);
  // Delta body keywords (the spec-side reflection of decisions).
  const deltaKw = unionAll(
    Object.values(change.deltaSpecs).flatMap((d) => [
      ...d.plan.added,
      ...d.plan.modified,
    ]).map((r) => requirementKeywords(r)),
  );

  for (const d of decisions) {
    const reflectedInTasks = overlaps(d.keywords, taskKw);
    const reflectedInSpecs = overlaps(d.keywords, deltaKw);
    if (!reflectedInTasks && !reflectedInSpecs) {
      findings.push({
        dimension: "coherence",
        ruleId: "coherence.decision-no-task",
        severity: "SUGGESTION",
        artifact: "design.md",
        line: d.line,
        message: `Design decision "${d.title}" is not reflected in any task or delta spec.`,
        rationale:
          "Coherence heuristic: decision title keywords share no overlap with task prose or delta requirement keywords. Best-effort; may be a false positive.",
      });
    }
  }

  // Deterministic ordering.
  findings.sort((a, b) =>
    a.dimension < b.dimension
      ? -1
      : a.dimension > b.dimension
        ? 1
        : (a.line ?? 0) - (b.line ?? 0) || a.ruleId.localeCompare(b.ruleId),
  );

  return { changeName: change.name, findings };
}

/** Extract intent keywords from a scenario body (the GWT bullet contents). */
function scenarioIntentKeywords(body: string): Set<string> {
  const out = new Set<string>();
  for (const line of body.split("\n")) {
    const m = line.match(GWT_BULLET);
    const text = m ? m[2] : line;
    for (const k of keywords(text)) out.add(k);
  }
  return out;
}

function unionAll(sets: Set<string>[]): Set<string> {
  return sets.reduce((acc, s) => union(acc, s), new Set<string>());
}

/** Re-export shared types for convenience. */
export type { HeuristicReport, VerifierFinding, VerifierSeverity } from "@/lib/verification/types";
