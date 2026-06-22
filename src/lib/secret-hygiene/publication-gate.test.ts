/**
 * Task 7.4 — Public repo publication gate (req 09.8: two-person + secret-scan).
 *
 * Spec source: `flow/requirements/09-auth-multitenancy.md` §9.8:
 *   (a) secret scan (gitleaks) MUST pass before anything reaches the public
 *       repo — covered by the gitleaks hooks + CI gate (Task 1.12).
 *   (b) the scan covers git history, not just the working tree.
 *   (c) Public-repo publication is a MANUAL, LOGGED, TWO-PERSON step —
 *       it is NOT automated.
 *
 * These tests pin the behaviour of the publication-gate primitive that wires
 * requirement (c): a release is only permitted when (1) a fresh secret scan
 * has passed and (2) two distinct persons (the requester + a second reviewer)
 * have signed off. Every release appends an audit-chain entry so the step is
 * logged and tamper-evident (NFR-10).
 */
import { describe, it, expect } from "vitest";
import {
  requestPublication,
  addApproval,
  releasePublication,
  verifyPublicationChain,
  type SecretScanResult,
} from "./publication-gate";
import { verifyChain, type ChainedAuditEntry } from "@/lib/audit-hash-chain";

const PASSED_SCAN: SecretScanResult = {
  scanner: "gitleaks",
  scannedAt: "2026-06-22T00:00:00Z",
  passed: true,
  findingsCount: 0,
  reportRef: "ci://runs/123/gitleaks",
};

const FAILED_SCAN: SecretScanResult = {
  scanner: "gitleaks",
  scannedAt: "2026-06-22T00:00:00Z",
  passed: false,
  findingsCount: 1,
  reportRef: "ci://runs/123/gitleaks",
};

describe("publication gate — request (Task 7.4)", () => {
  it("creates a pending publication request with no approvals and no release", () => {
    const rec = requestPublication({
      targetRepo: "https://github.com/buihongduc132/openspec-dashboard.git",
      ref: "main",
      commitSha: "abc123",
      requester: "alice",
      secretScan: PASSED_SCAN,
    });
    expect(rec.releasedAt).toBeNull();
    expect(rec.releasedBy).toBeNull();
    expect(rec.approvals).toEqual([]);
    expect(rec.request.requester).toBe("alice");
    expect(rec.request.commitSha).toBe("abc123");
    expect(rec.secretScan.passed).toBe(true);
  });
});

describe("publication gate — two-person rule (Task 7.4, req 09.8c)", () => {
  it("REFUSES release when only the requester has signed (no second person)", () => {
    const rec = requestPublication({
      targetRepo: "https://github.com/example/repo.git",
      ref: "main",
      commitSha: "deadbeef",
      requester: "alice",
      secretScan: PASSED_SCAN,
    });
    const result = releasePublication(rec, { releasedBy: "alice" });
    expect(result.released).toBe(false);
    expect(result.reason).toBe("no-second-person");
  });

  it("REFUSES release when the requester tries to self-approve", () => {
    let rec = requestPublication({
      targetRepo: "https://github.com/example/repo.git",
      ref: "main",
      commitSha: "deadbeef",
      requester: "alice",
      secretScan: PASSED_SCAN,
    });
    // A requester approving their own request does NOT count as the second
    // person — addApproval must reject a self-approval.
    expect(() =>
      addApproval(rec, { reviewer: "alice", approvedAt: "2026-06-22T00:00:00Z", comment: null }),
    ).toThrow(/self-approv/);
    // Record is unchanged.
    expect(rec.approvals).toEqual([]);
  });

  it("PERMITS release once a distinct reviewer has approved + scan passed", () => {
    let rec = requestPublication({
      targetRepo: "https://github.com/example/repo.git",
      ref: "main",
      commitSha: "deadbeef",
      requester: "alice",
      secretScan: PASSED_SCAN,
    });
    rec = addApproval(rec, {
      reviewer: "bob",
      approvedAt: "2026-06-22T00:01:00Z",
      comment: "lgtm",
    });
    const result = releasePublication(rec, { releasedBy: "alice" });
    expect(result.released).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.record.releasedAt).not.toBeNull();
    expect(result.record.releasedBy).toBe("alice");
  });

  it("treats two approvals from the SAME second person as still just two persons (idempotent)", () => {
    let rec = requestPublication({
      targetRepo: "https://github.com/example/repo.git",
      ref: "main",
      commitSha: "deadbeef",
      requester: "alice",
      secretScan: PASSED_SCAN,
    });
    rec = addApproval(rec, { reviewer: "bob", approvedAt: "2026-06-22T00:01:00Z", comment: null });
    rec = addApproval(rec, { reviewer: "bob", approvedAt: "2026-06-22T00:02:00Z", comment: null });
    // Two approvals but only one DISTINCT second person — still releasable.
    const result = releasePublication(rec, { releasedBy: "alice" });
    expect(result.released).toBe(true);
  });
});

describe("publication gate — secret-scan rule (Task 7.4, req 09.8a)", () => {
  it("REFUSES release when the secret scan failed, even with two persons", () => {
    let rec = requestPublication({
      targetRepo: "https://github.com/example/repo.git",
      ref: "main",
      commitSha: "deadbeef",
      requester: "alice",
      secretScan: FAILED_SCAN,
    });
    rec = addApproval(rec, { reviewer: "bob", approvedAt: "2026-06-22T00:01:00Z", comment: null });
    const result = releasePublication(rec, { releasedBy: "alice" });
    expect(result.released).toBe(false);
    expect(result.reason).toBe("secret-scan-failed");
    expect(result.record.releasedAt).toBeNull();
  });
});

describe("publication gate — audit logging (Task 7.4, req 09.8c manual+logged)", () => {
  it("appends a tamper-evident audit-chain entry on release", () => {
    let rec = requestPublication({
      targetRepo: "https://github.com/buihongduc132/openspec-dashboard.git",
      ref: "main",
      commitSha: "abc123",
      requester: "alice",
      secretScan: PASSED_SCAN,
    });
    rec = addApproval(rec, { reviewer: "bob", approvedAt: "2026-06-22T00:01:00Z", comment: null });
    const result = releasePublication(rec, { releasedBy: "alice" });
    expect(result.released).toBe(true);

    const audit = result.auditEntries as ChainedAuditEntry[];
    expect(audit.length).toBe(1);
    expect(audit[0].auditEntry.action).toBe("publication.release");
    // The released commit + target repo must be recorded for traceability.
    const details = JSON.parse(audit[0].auditEntry.details ?? "{}");
    expect(details.commitSha).toBe("abc123");
    expect(details.targetRepo).toContain("openspec-dashboard");
    // Two-person evidence is captured.
    expect(details.approvers).toEqual(["bob"]);
    expect(details.requester).toBe("alice");
    // The chain verifies clean (no tamper / no gap).
    expect(verifyChain(audit).valid).toBe(true);
    // The dedicated verifier mirrors verifyChain for the publication slice.
    expect(verifyPublicationChain(audit).valid).toBe(true);
  });
});
