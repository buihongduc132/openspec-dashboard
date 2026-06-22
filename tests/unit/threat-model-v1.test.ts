import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Threat model v1 (NFR-11, req 08 §8.10).
//
// The governing spec is openspec/changes/phase0-foundations/specs/threat-model-v1.
// These tests encode its two scenarios as machine-checkable structural gates so
// the "Phase 0 milestone verifier" can run them instead of eyeballing the doc.

const REPO_ROOT = resolve(__dirname, "..", "..");
const DOC_PATH = resolve(REPO_ROOT, "docs", "threat-model", "v1.md");

function doc(): string {
  //existence is asserted explicitly in the first test; this helper is only
  //called after that, so a missing file surfaces as a clear read error.
  return readFileSync(DOC_PATH, "utf8");
}

// Each required Phase 0+1 surface (req 08 §8.10 + the threat-model-v1 spec).
// The verifier must find a section for each with >=1 threat and a mitigation.
const REQUIRED_SURFACES = [
  {
    key: "project-registration",
    label: /project registration/i,
    threats: [/path traversal/i],
  },
  {
    key: "clone-rce",
    label: /clone rce|clone RCE|sandboxed clone/i,
    threats: [/clone|remote|sandbox/i],
  },
  {
    key: "agent-write-api",
    label: /agent write api|agent write-api|agent write\b/i,
    threats: [/path-confinement|confinement|privilege/i],
  },
  {
    key: "inbound-webhook",
    label: /inbound webhook/i,
    threats: [/forgery|replay/i],
  },
  {
    key: "outbound-webhook-ssrf",
    label: /outbound webhook/i,
    threats: [/ssrf/i],
  },
  {
    key: "multi-tenant-isolation",
    label: /multi-tenant|multitenant|tenant isolation/i,
    threats: [/cross-tenant|tenant|isolation/i],
  },
  {
    key: "public-repo-publication",
    label: /public[- ]repo|publication/i,
    threats: [/secret|leak/i],
  },
] as const;

describe("threat model v1 (NFR-11)", () => {
  it("exists at docs/threat-model/v1.md", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it("is versioned with a date and an author/maintainer record", () => {
    const text = doc();
    // Versioning per spec scenario "Document is versioned and reviewable".
    expect(text).toMatch(/version/i);
    expect(text).toMatch(/\b20\d{2}-\d{2}-\d{2}\b/); // ISO date
    expect(text).toMatch(/author|maintainer|owner/i);
  });

  describe.each(REQUIRED_SURFACES)(
    "surface: $key",
    ({ label, threats }) => {
      it("has a section with at least one identified threat and a mitigation", () => {
        const text = doc();
        expect(text, `missing section header for ${label}`).toMatch(label);
        // Mitigation language must appear somewhere in the document.
        expect(text, `no mitigation language for ${label}`).toMatch(
          /mitigation|control|prevent|guard|enforce/i,
        );
        // At least one threat keyword for the surface.
        for (const threat of threats) {
          expect(text, `no threat keyword ${threat} for ${label}`).toMatch(threat);
        }
      });
    },
  );

  it("maps Phase-0-in-code surfaces to concrete spec/task mitigations (not placeholders)", () => {
    const text = doc();
    // Per spec: registration path-traversal MUST cite the filesystem-projection
    // path allowlist (or an equivalent concrete artifact), and must NOT leave
    // Phase-0 surfaces as "to be designed".
    expect(text).toMatch(/path[- ]allowlist|allowlist|allow-list/i);
    expect(text).not.toMatch(/to be designed|TBD|TODO/i);
  });

  it("explicitly marks forward-looking surfaces (agent API / webhooks) as not yet implemented", () => {
    const text = doc();
    // Forward-looking surfaces must be labelled so they are not mistaken for
    // already-mitigated risks.
    expect(text).toMatch(/forward-looking|not yet implemented|Phase 3b|deferred/i);
  });

  it("records a Phase 0 gate review entry", () => {
    const text = doc();
    // Spec scenario: "the Phase 0 gate review is logged".
    expect(text).toMatch(/Phase 0 (?:milestone )?gate|gate review/i);
  });
});
