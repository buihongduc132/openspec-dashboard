/**
 * Task 6.4 — LLM verifier tier (req 06 §6.1d, phase3b design D6).
 *
 * The LLM tier is an OPTIONAL, pluggable adapter layered on top of the Phase 2
 * heuristic verifier (design D6). It reuses the existing {@link VerifierFinding}
 * model so the validation dashboard stays uniform (req 06.3), and it is
 * **additive**: when disabled or when the LLM misbehaves, the combined verifier
 * silently degrades to heuristic-only and NEVER throws because of the LLM
 * (req 06.1c — verification is advisory; one bad LLM reply must not block
 * archiving).
 *
 * Cost-runaway controls (phase3b Risks): per-run token cap, per-project daily
 * token cap, per-run timeout, and cost/latency recorded on every report.
 *
 * The actual LLM transport is an injected {@link LLMVerifierBackend} so the
 * verifier is deterministic and network-free in tests; a production adapter
 * (OpenAI / Anthropic / …) is wired at the route layer, not here.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.1(d) +
 *         `openspec/changes/phase3b-integration/design.md` D6 + Risks.
 */

import type { ChangeModel } from "@/lib/openspec-parser";
import { verifyChangeHeuristic } from "@/lib/verification/heuristic";
import type {
  VerifierDimension,
  VerifierFinding,
  VerifierSeverity,
} from "@/lib/verification/types";

/** The three valid heuristic dimensions LLM findings are mapped onto. */
const DIMENSIONS: readonly VerifierDimension[] = [
  "completeness",
  "correctness",
  "coherence",
] as const;

/** The three valid severities (req 06.1 AC a). */
const SEVERITIES: readonly VerifierSeverity[] = [
  "CRITICAL",
  "WARNING",
  "SUGGESTION",
] as const;

/**
 * Per-project configuration for the LLM verifier tier. `enabled` gates whether
 * the LLM is consulted at all (req 06.1d "Enabled per-project"). The caps and
 * timeout implement the cost-runaway controls from phase3b Risks.
 */
export interface LLMVerifierConfig {
  /** Whether the LLM tier is consulted for this project. */
  enabled: boolean;
  /** Hard cap on tokens consumed by a single run; over-budget results discarded. */
  maxTokensPerRun: number;
  /** Wall-clock timeout per LLM run in milliseconds. */
  timeoutMs: number;
  /** Per-project rolling 24h token budget; runs are refused once hit. */
  dailyTokenCap: number;
}

/**
 * Injected LLM transport. Implementations serialize the prompt, call their
 * provider, parse JSON, and return the raw (untrusted) payload plus usage
 * telemetry. The {@link verifyChangeWithLLMTier} orchestrator validates and
 * sandboxes whatever this returns.
 */
export interface LLMVerifierBackend {
  verify(
    prompt: string,
    opts: { maxTokens: number; timeoutMs: number },
  ): Promise<LLMRawResult>;
}

/** Raw, untrusted output from the LLM backend (pre-validation). */
export interface LLMRawResult {
  /** Untrusted findings payload — may be malformed. */
  findings: unknown;
  tokensUsed: number;
  costUsd?: number;
  latencyMs?: number;
}

/** Telemetry for one LLM run, surfaced on the report (req 06.1d). */
export interface LLMUsage {
  /** True when the run was skipped or its output discarded (safe degradation). */
  degraded: boolean;
  /** Human-readable reason when {@link degraded} is true. */
  degradeReason?: string;
  /** Tokens attributable to this run (0 when refused/discarded). */
  tokensUsed: number;
  costUsd?: number;
  latencyMs?: number;
}

/** Output of {@link verifyChangeWithLLMTier}: merged findings + optional LLM telemetry. */
export interface CombinedVerifierReport {
  changeName: string;
  findings: VerifierFinding[];
  /** Present only when the LLM tier was eligible to run (enabled). */
  llm?: LLMUsage;
}

/** Options for {@link verifyChangeWithLLMTier}. */
export interface VerifyWithLLMOptions {
  config: LLMVerifierConfig;
  /** LLM transport. Required when {@link LLMVerifierConfig.enabled} is true. */
  backend?: LLMVerifierBackend;
  /** Tokens already consumed against the per-project daily cap (default 0). */
  dailyTokensUsed?: number;
}

/**
 * Run the combined verifier: heuristic tier always, LLM tier when enabled and
 * healthy. Safe-degrades on any LLM failure (design D6, req 06.1c).
 */
export async function verifyChangeWithLLMTier(
  change: ChangeModel,
  opts: VerifyWithLLMOptions,
): Promise<CombinedVerifierReport> {
  const heuristicReport = verifyChangeHeuristic(change);
  const findings: VerifierFinding[] = [...heuristicReport.findings];

  if (!opts.config.enabled) {
    return { changeName: change.name, findings };
  }

  const usage = await runLLMTier(change, opts);
  if (!usage.degraded) {
    findings.push(...usage.findings!);
  }

  return {
    changeName: change.name,
    findings,
    llm: usage.summary,
  };
}

interface LLMRunResult {
  degraded: boolean;
  summary: LLMUsage;
  findings?: VerifierFinding[];
}

/** Execute the LLM tier with all guardrails; never throws. */
async function runLLMTier(
  change: ChangeModel,
  opts: VerifyWithLLMOptions,
): Promise<LLMRunResult> {
  const { config, backend, dailyTokensUsed = 0 } = opts;

  const safe = (
    reason: string,
    extra: Partial<LLMUsage> = {},
  ): LLMRunResult => ({
    degraded: true,
    summary: { degraded: true, degradeReason: reason, tokensUsed: 0, ...extra },
  });

  if (!backend) {
    return safe("LLM backend not configured");
  }

  // Pre-flight: per-project daily cap already exhausted.
  if (dailyTokensUsed >= config.dailyTokenCap) {
    return safe("daily token cap reached");
  }

  const prompt = buildPrompt(change);

  let raw: LLMRawResult;
  try {
    raw = await withTimeout(
      backend.verify(prompt, {
        maxTokens: config.maxTokensPerRun,
        timeoutMs: config.timeoutMs,
      }),
      config.timeoutMs,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return safe(msg.startsWith("timeout") ? "timeout" : `LLM error: ${msg}`);
  }

  // Post-flight: per-run token cap exceeded → discard the runaway response.
  if (raw.tokensUsed > config.maxTokensPerRun) {
    return safe("per-run token cap exceeded", {
      costUsd: raw.costUsd,
      latencyMs: raw.latencyMs,
    });
  }

  const parsed = parseFindings(raw.findings);
  if (parsed.invalid || parsed.findings.length === 0) {
    // Entirely unusable payload → degrade.
    return safe("malformed LLM output", {
      costUsd: raw.costUsd,
      latencyMs: raw.latencyMs,
    });
  }

  return {
    degraded: false,
    summary: {
      degraded: false,
      tokensUsed: raw.tokensUsed,
      costUsd: raw.costUsd,
      latencyMs: raw.latencyMs,
    },
    findings: parsed.findings,
  };
}

/** Reject a promise after `timeoutMs` so a hung LLM call cannot block forever. */
function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout")),
      timeoutMs,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

interface ParsedFindings {
  invalid: boolean;
  findings: VerifierFinding[];
}

/** Validate untrusted LLM findings; drop malformed entries, keep good ones. */
function parseFindings(raw: unknown): ParsedFindings {
  if (!Array.isArray(raw)) return { invalid: true, findings: [] };
  const out: VerifierFinding[] = [];
  for (const entry of raw) {
    const f = coerceFinding(entry);
    if (f) out.push(f);
  }
  return { invalid: false, findings: out };
}

/** Coerce one untrusted entry into a {@link VerifierFinding}, or `null`. */
function coerceFinding(entry: unknown): VerifierFinding | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  if (
    typeof e.ruleId !== "string" ||
    typeof e.artifact !== "string" ||
    typeof e.message !== "string" ||
    typeof e.rationale !== "string"
  ) {
    return null;
  }
  if (!isDimension(e.dimension) || !isSeverity(e.severity)) return null;
  const line = typeof e.line === "number" ? e.line : undefined;
  return {
    dimension: e.dimension,
    ruleId: e.ruleId,
    severity: e.severity,
    artifact: e.artifact,
    ...(line !== undefined ? { line } : {}),
    message: e.message,
    rationale: e.rationale,
  };
}

function isDimension(v: unknown): v is VerifierDimension {
  return typeof v === "string" && (DIMENSIONS as readonly string[]).includes(v);
}

function isSeverity(v: unknown): v is VerifierSeverity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
}

/** Serialize a change into a stable prompt for the LLM backend. */
function buildPrompt(change: ChangeModel): string {
  const parts: string[] = [
    `# Change: ${change.name}`,
    "",
    "## Tasks",
    ...flattenTaskLabels(change).map((t) => `- ${t}`),
    "",
  ];
  for (const [domain, delta] of Object.entries(change.deltaSpecs)) {
    parts.push(`## Delta: ${domain}`);
    for (const req of [...delta.plan.added, ...delta.plan.modified]) {
      parts.push(`### Requirement: ${req.name}`);
      parts.push(req.body.trim());
    }
    parts.push("");
  }
  parts.push(
    "Return ONLY a JSON object: { \"findings\": [{ dimension, ruleId, severity, artifact, line?, message, rationale }] }",
  );
  return parts.join("\n");
}

function flattenTaskLabels(change: ChangeModel): string[] {
  const out: string[] = [];
  const walk = (items: { label: string; children: unknown[] }[]): void => {
    for (const t of items) {
      out.push(t.label);
      walk(t.children as { label: string; children: unknown[] }[]);
    }
  };
  walk(change.tasks.items as { label: string; children: unknown[] }[]);
  return out;
}
