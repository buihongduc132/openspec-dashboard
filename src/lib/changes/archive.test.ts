/**
 * Task 2.17 — Change single-archive with inverse-patch + per-project mutex
 * (req 03.13, INV-4/INV-4a).
 *
 * Pure-logic tests for the archive engine:
 *   - 3.13 (a) apply delta specs to main specs and record an inverse-patch
 *     so the merge is reversible (INV-4 non-destructive, cross-session).
 *   - 3.13 (b)/(INV-4a) restore gate: a restore is blocked when a
 *     later-archived change (higher monotonic archiveSeq) touched the same
 *     requirement (D-ReqID) — the sole exception to INV-4.
 *   - 3.13 (d) per-project archive mutex: concurrent archives on the same
 *     project serialize; different projects run concurrently.
 *
 * The route layer composes these with the filesystem + git; everything here
 * is deterministic and side-effect free.
 */
import { describe, it, expect } from "vitest";
import {
  applyDeltaToSpec,
  revertSpec,
  computeRestoreStatus,
  ArchiveMutex,
  type ArchiveRecord,
} from "@/lib/changes/archive";

// Canonical main spec: two requirements under an ADDED section.
const MAIN = [
  "## ADDED Requirements",
  "",
  "### Requirement: Login",
  "User can log in.",
  "",
  "#### Scenario: success",
  "- **WHEN** user logs in",
  "- **THEN** session created",
  "",
  "### Requirement: Profile",
  "User has a profile page.",
  "",
].join("\n");

describe("Task 2.17 — Apply deltas with inverse-patch (req 03.13 a, INV-4)", () => {
  it("ADDED inserts a new requirement and inverse-patch removes it on revert", () => {
    const delta = [
      "## ADDED Requirements",
      "",
      "### Requirement: Logout",
      "User can log out.",
      "",
    ].join("\n");
    const { merged, inverse } = applyDeltaToSpec(MAIN, delta);
    expect(merged).toContain("### Requirement: Logout");
    expect(merged).toContain("### Requirement: Login");
    expect(merged).toContain("### Requirement: Profile");
    // INV-4: revert restores the original main byte-for-byte.
    expect(revertSpec(merged, inverse)).toBe(MAIN);
  });

  it("MODIFIED replaces the body and inverse-patch restores the original", () => {
    const delta = [
      "## MODIFIED Requirements",
      "",
      "### Requirement: Login",
      "User can log in with email or username.",
      "",
    ].join("\n");
    const { merged, inverse } = applyDeltaToSpec(MAIN, delta);
    expect(merged).toContain("log in with email or username");
    expect(merged).not.toContain("User can log in.\n");
    // Profile untouched.
    expect(merged).toContain("### Requirement: Profile");
    expect(revertSpec(merged, inverse)).toBe(MAIN);
  });

  it("REMOVED deletes the requirement and inverse-patch reinserts it", () => {
    const delta = [
      "## REMOVED Requirements",
      "",
      "### Requirement: Profile",
      "",
    ].join("\n");
    const { merged, inverse } = applyDeltaToSpec(MAIN, delta);
    expect(merged).not.toContain("### Requirement: Profile");
    expect(merged).toContain("### Requirement: Login");
    expect(revertSpec(merged, inverse)).toBe(MAIN);
  });

  it("RENAMED renames the requirement and inverse-patch renames it back", () => {
    // RENAMED pairs: old-name block then new-name block (parser §RENAMED).
    const delta = [
      "## RENAMED Requirements",
      "",
      "### Requirement: Login",
      "",
      "### Requirement: SignIn",
      "",
    ].join("\n");
    const { merged, inverse } = applyDeltaToSpec(MAIN, delta);
    expect(merged).toContain("### Requirement: SignIn");
    expect(merged).not.toContain("### Requirement: Login");
    expect(merged).toContain("### Requirement: Profile");
    expect(revertSpec(merged, inverse)).toBe(MAIN);
  });

  it("records the touched requirement titles for INV-4a set comparison", () => {
    const delta = [
      "## ADDED Requirements",
      "",
      "### Requirement: Logout",
      "User can log out.",
      "",
    ].join("\n");
    const { touched } = applyDeltaToSpec(MAIN, delta);
    expect(touched).toContain("Logout");
  });
});

describe("Task 2.17 — INV-4a restore gate (req 03.13 b, INV-4a)", () => {
  it("blocks restore when a later archive touched the same requirement", () => {
    const target: ArchiveRecord = { archiveSeq: 1, requirements: ["Login"] };
    const others: ArchiveRecord[] = [
      { archiveSeq: 3, requirements: ["Login"] },
      { archiveSeq: 2, requirements: ["Profile"] },
    ];
    const status = computeRestoreStatus(target, others);
    expect(status.restorable).toBe(false);
    expect(status.blockedBy).toBeDefined();
    expect(status.blockedBy?.archiveSeq).toBe(3);
    expect(status.reason).toMatch(/Login/);
  });

  it("allows restore when later archives touched disjoint requirements", () => {
    const target: ArchiveRecord = { archiveSeq: 1, requirements: ["Login"] };
    const others: ArchiveRecord[] = [
      { archiveSeq: 2, requirements: ["Profile"] },
      { archiveSeq: 3, requirements: ["Logout"] },
    ];
    const status = computeRestoreStatus(target, others);
    expect(status.restorable).toBe(true);
    expect(status.reason).toBeUndefined();
  });

  it("ignores earlier archives (only LATER sequence numbers block)", () => {
    const target: ArchiveRecord = { archiveSeq: 5, requirements: ["Login"] };
    const others: ArchiveRecord[] = [
      { archiveSeq: 1, requirements: ["Login"] },
    ];
    const status = computeRestoreStatus(target, others);
    expect(status.restorable).toBe(true);
  });

  it("restore of a restored change uses the new higher sequence (D-ArchiveSeq)", () => {
    // A restored+re-archived change has a fresh higher seq; an even-later
    // overlapping archive blocks it.
    const target: ArchiveRecord = { archiveSeq: 7, requirements: ["Login"] };
    const others: ArchiveRecord[] = [
      { archiveSeq: 9, requirements: ["Login"] },
    ];
    const status = computeRestoreStatus(target, others);
    expect(status.restorable).toBe(false);
  });
});

describe("Task 2.17 — Per-project archive mutex (req 03.13 d)", () => {
  it("serializes concurrent archives on the same project", async () => {
    const mutex = new ArchiveMutex();
    const order: string[] = [];
    const a = mutex.withLock("proj-1", async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a-end");
      return "a";
    });
    const b = mutex.withLock("proj-1", async () => {
      order.push("b-start");
      order.push("b-end");
      return "b";
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("a");
    expect(rb).toBe("b");
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("runs archives on different projects concurrently", async () => {
    const mutex = new ArchiveMutex();
    const order: string[] = [];
    const a = mutex.withLock("proj-1", async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a-end");
    });
    const b = mutex.withLock("proj-2", async () => {
      order.push("b-start");
      order.push("b-end");
    });
    await Promise.all([a, b]);
    // proj-2 must NOT wait for proj-1.
    expect(order.indexOf("b-start")).toBeLessThan(order.indexOf("a-end"));
  });

  it("releases the lock even when the critical section throws", async () => {
    const mutex = new ArchiveMutex();
    await expect(
      mutex.withLock("proj-x", async () => {
        throw new Error("git commit failed");
      }),
    ).rejects.toThrow("git commit failed");
    // A second acquire on the same project must proceed (lock was released).
    const ok = await mutex.withLock("proj-x", async () => "recovered");
    expect(ok).toBe("recovered");
  });
});
