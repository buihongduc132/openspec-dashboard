/**
 * Task 6.4 — LLM verifier tier unit tests (req 06 §6.1d, design phase3b D6).
 *
 * The LLM tier is a pluggable adapter behind the existing verifier interface
 * (design D6):
 *  - It is enabled per-project via a config flag; disabled = heuristic only.
 *  - It calls an injectable LLM backend with the change serialized as a prompt.
 *  - It reuses the existing {@link VerifierFinding} model so the validation
 *    dashboard stays uniform (req 06.3).
 *  - Malformed LLM output / errors are caught and the combined verifier
 *    degrades safely to heuristic-only — it NEVER throws because of the LLM.
 *  - Cost / latency / token usage are surfaced on every report (req 06.1d).
 *  - Per-run token cap + per-project daily cap + timeout cap runaway cost
 *    (phase3b Risks).
 *
 * The LLM backend is injected so tests never touch a real network/LLM.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.1(d) +
 *         `openspec/changes/phase3b-integration/design.md` D6 + Risks.
 */
import { describe, it, expect } from "vitest";
import { parseChange, type ChangeModel } from "@/lib/openspec-parser";
import {
  verifyChangeWithLLMTier,
  type LLMVerifierBackend,
  type LLMVerifierConfig,
} from "@/lib/verification/llm";

function change(): ChangeModel {
  return parseChange(
    "add-rbac",
    {
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: RBAC enforcement",
        "The system SHALL enforce RBAC.",
        "",
        "#### Scenario: Enforce",
        "- **THEN** access is enforced",
        "",
      ].join("\n"),
      "tasks.md": ["- [x] 1.1 Implement RBAC enforcement"].join("\n"),
    },
  );
}

/** A controllable fake backend for deterministic tests. */
function fakeBackend(
  response: { findings: unknown[]; tokensUsed?: number; costUsd?: number },
  opts: { latencyMs?: number } = {},
): LLMVerifierBackend {
  return {
    async verify() {
      return {
        findings: response.findings,
        tokensUsed: response.tokensUsed ?? 100,
        costUsd: response.costUsd ?? 0.002,
        latencyMs: opts.latencyMs ?? 42,
      };
    },
  };
}

const disabledConfig: LLMVerifierConfig = {
  enabled: false,
  maxTokensPerRun: 4_000,
  timeoutMs: 5_000,
  dailyTokenCap: 100_000,
};

const enabledConfig: LLMVerifierConfig = {
  enabled: true,
  maxTokensPerRun: 4_000,
  timeoutMs: 5_000,
  dailyTokenCap: 100_000,
};

describe("verifyChangeWithLLMTier — enable/disable (req 06.1d 'Enabled per-project')", () => {
  it("when disabled, runs only the heuristic tier and records no LLM usage", async () => {
    const report = await verifyChangeWithLLMTier(change(), {
      config: disabledConfig,
    });

    expect(report.findings.length).toBeGreaterThan(0);
    // Every finding is from a heuristic dimension (no LLM dimension leakage).
    for (const f of report.findings) {
      expect(["completeness", "correctness", "coherence"]).toContain(
        f.dimension,
      );
    }
    expect(report.llm).toBeUndefined();
  });

  it("when enabled with a healthy backend, merges heuristic + LLM findings", async () => {
    const backend = fakeBackend({
      findings: [
        {
          dimension: "correctness",
          ruleId: "llm.missing-edge-case",
          severity: "SUGGESTION",
          artifact: "specs/auth/spec.md",
          line: 3,
          message: "LLM: consider the superadmin bypass edge case.",
          rationale: "LLM-augmented reasoning flagged this.",
        },
      ],
    });

    const report = await verifyChangeWithLLMTier(change(), {
      config: enabledConfig,
      backend,
    });

    const llmFinding = report.findings.find(
      (f) => f.ruleId === "llm.missing-edge-case",
    );
    expect(llmFinding).toBeDefined();
    expect(report.llm).toBeDefined();
    expect(report.llm!.degraded).toBe(false);
    expect(report.llm!.tokensUsed).toBe(100);
    expect(report.llm!.costUsd).toBe(0.002);
    expect(report.llm!.latencyMs).toBe(42);
  });
});

describe("verifyChangeWithLLMTier — safe degradation (design D6, req 06.1c)", () => {
  it("never throws on malformed LLM output; degrades to heuristic-only", async () => {
    const backend: LLMVerifierBackend = {
      async verify() {
        // Garbage instead of a findings array.
        return {
          // intentionally wrong shape
          findings: "not-an-array" as unknown as never[],
          tokensUsed: 50,
        };
      },
    };

    const report = await verifyChangeWithLLMTier(change(), {
      config: enabledConfig,
      backend,
    });

    expect(report.llm).toBeDefined();
    expect(report.llm!.degraded).toBe(true);
    // Heuristic findings still present — verifier kept working.
    expect(report.findings.length).toBeGreaterThan(0);
    // No llm.* findings leaked from the malformed payload.
    expect(
      report.findings.some((f) => f.ruleId.startsWith("llm.")),
    ).toBe(false);
  });

  it("never throws when the backend rejects; degrades to heuristic-only", async () => {
    const backend: LLMVerifierBackend = {
      async verify() {
        throw new Error("network down");
      },
    };

    const report = await verifyChangeWithLLMTier(change(), {
      config: enabledConfig,
      backend,
    });

    expect(report.llm!.degraded).toBe(true);
    expect(report.llm!.tokensUsed).toBe(0);
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("filters out individual malformed findings, keeping well-formed ones", async () => {
    const backend = fakeBackend({
      findings: [
        {
          dimension: "correctness",
          ruleId: "llm.good",
          severity: "SUGGESTION",
          artifact: "specs/auth/spec.md",
          message: "ok",
          rationale: "ok",
        },
        { dimension: "bogus", ruleId: "llm.bad" }, // missing fields
        "garbage",
        null,
      ],
    });

    const report = await verifyChangeWithLLMTier(change(), {
      config: enabledConfig,
      backend,
    });

    const llmFindings = report.findings.filter((f) =>
      f.ruleId.startsWith("llm."),
    );
    expect(llmFindings).toHaveLength(1);
    expect(llmFindings[0]?.ruleId).toBe("llm.good");
  });
});

describe("verifyChangeWithLLMTier — cost runaway caps (phase3b Risks)", () => {
  it("refuses to run and degrades when the run would exceed the per-run token cap", async () => {
    const backend = fakeBackend({ findings: [], tokensUsed: 10_000 });
    const report = await verifyChangeWithLLMTier(change(), {
      config: { ...enabledConfig, maxTokensPerRun: 1_000 },
      backend,
    });

    expect(report.llm!.degraded).toBe(true);
    expect(report.llm!.tokensUsed).toBe(0);
  });

  it("refuses to run and degrades when the per-project daily cap is already hit", async () => {
    const backend = fakeBackend({ findings: [] });
    const report = await verifyChangeWithLLMTier(change(), {
      config: enabledConfig,
      backend,
      dailyTokensUsed: 100_000, // cap reached
    });

    expect(report.llm!.degraded).toBe(true);
    expect(report.llm!.degradeReason).toMatch(/daily/i);
  });
});
