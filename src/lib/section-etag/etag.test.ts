/**
 * Task 1.9 — Per-section ETag (INV-7) unit tests.
 *
 * Spec source:
 *  - `openspec/changes/build-openspec-dashboard-mvp/specs/dashboard-foundation/
 *    spec.md` (Requirement "Filesystem projection with atomic writes"; the two
 *    concurrent-edit scenarios).
 *  - `flow/requirements/README.md` §"INV-7 Per-section optimistic concurrency"
 *    and §"Section Granularity Table (INV-7)".
 *
 * Behaviour asserted here:
 *  - ETag = SHA256(sectionBytes ‖ monotonicVersion); deterministic; changes
 *    when either the section bytes or the per-section version change.
 *  - Two users editing DIFFERENT sections of the same file both succeed
 *    (the core INV-7 invariant — sibling sections never invalidate each
 *    other).
 *  - Two users editing the SAME section: the second commit returns a conflict
 *    (409 + merge-UI signal) and the per-section version is NOT bumped.
 *  - Create (POST) of a brand-new section is exempt from If-Match.
 *  - A mutation to section X invalidates ONLY X's ETag (minimal invalidation).
 */
import { describe, it, expect } from "vitest";
import {
  computeEtag,
  SectionEtagStore,
} from "@/lib/section-etag";

describe("computeEtag", () => {
  it("is deterministic for the same bytes + version", () => {
    expect(computeEtag("hello", 0)).toBe(computeEtag("hello", 0));
  });

  it("changes when the section bytes change (version held constant)", () => {
    expect(computeEtag("hello", 0)).not.toBe(computeEtag("goodbye", 0));
  });

  it("changes when the version changes (bytes held constant)", () => {
    expect(computeEtag("hello", 0)).not.toBe(computeEtag("hello", 1));
  });
});

describe("SectionEtagStore — INV-7 per-section optimistic concurrency", () => {
  it("tracks a section's initial bytes at version 0", () => {
    const store = new SectionEtagStore();
    const etag = store.track("tasks.md", "line:1", "- [ ] ship it");
    expect(etag).toBe(computeEtag("- [ ] ship it", 0));
    expect(store.get("tasks.md", "line:1")).toBe(etag);
  });

  it("lets two users edit DIFFERENT sections of the same file both succeed", () => {
    // The defining INV-7 scenario: user A edits task line 5, user B edits
    // task line 12 of the SAME tasks.md — both with valid If-Match for their
    // own sections. Neither receives a conflict.
    const store = new SectionEtagStore();
    const etagA0 = store.track("tasks.md", "line:5", "- [ ] task five");
    const etagB0 = store.track("tasks.md", "line:12", "- [ ] task twelve");

    const a = store.commit("tasks.md", "line:5", "- [x] task five", etagA0);
    const b = store.commit("tasks.md", "line:12", "- [ ] task twelve (edited)", etagB0);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // Each section's etag advanced independently.
    expect(a.etag).toBe(computeEtag("- [x] task five", 1));
    expect(b.etag).toBe(computeEtag("- [ ] task twelve (edited)", 1));
  });

  it("rejects the second commit when two users edit the SAME section", () => {
    // The defining INV-7 conflict scenario: both edit task line 5 with the
    // same starting ETag. The second commit returns a conflict.
    const store = new SectionEtagStore();
    const etag0 = store.track("tasks.md", "line:5", "- [ ] original");

    const a = store.commit("tasks.md", "line:5", "- [x] A wins", etag0);
    expect(a.ok).toBe(true);

    // B still holds the ORIGINAL etag → now stale → 409 conflict.
    const b = store.commit("tasks.md", "line:5", "- [x] B wins", etag0);
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.reason).toBe("conflict");
      // The current (post-A) etag is returned so the merge UI can offer 3-way.
      expect(b.etag).toBe(a.etag);
      expect(b.currentBytes).toBe("- [x] A wins");
    }
  });

  it("does NOT bump the version of a conflicting commit", () => {
    const store = new SectionEtagStore();
    const etag0 = store.track("tasks.md", "line:1", "- [ ] one");

    const ok = store.commit("tasks.md", "line:1", "- [x] one", etag0);
    expect(ok.ok).toBe(true);

    const conflict = store.commit("tasks.md", "line:1", "- [ ] one again", etag0);
    expect(conflict.ok).toBe(false);

    // A subsequent VALID commit (using the now-current etag) advances to v2,
    // proving the rejected commit did not consume a version number.
    if (!ok.ok) throw new Error("unreachable");
    const next = store.commit("tasks.md", "line:1", "- [x] one v2", ok.etag);
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.etag).toBe(computeEtag("- [x] one v2", 2));
    }
  });

  it("exempts CREATE (POST) of a brand-new section from If-Match", () => {
    // Per INV-7: "Create operations (POST) are exempt from If-Match (the
    // section does not yet exist)". Committing an untracked section with no
    // If-Match is accepted.
    const store = new SectionEtagStore();
    const created = store.commit("tasks.md", "line:99", "- [ ] new task", undefined);
    expect(created.ok).toBe(true);
    if (created.ok) {
      // First accepted mutation lands at version 1.
      expect(created.etag).toBe(computeEtag("- [ ] new task", 1));
    }
  });

  it("invalidates ONLY the edited section — sibling etags are untouched", () => {
    // Minimal-invalidation rule: a mutation to section X invalidates ONLY X.
    const store = new SectionEtagStore();
    const e5 = store.track("tasks.md", "line:5", "- [ ] five");
    const e12 = store.track("tasks.md", "line:12", "- [ ] twelve");

    store.commit("tasks.md", "line:5", "- [x] five", e5);

    // Sibling section 12 still has its ORIGINAL etag — not invalidated.
    expect(store.get("tasks.md", "line:12")).toBe(e12);
  });

  it("list() returns the current etag of every tracked section in a file", () => {
    const store = new SectionEtagStore();
    const e1 = store.track("tasks.md", "line:1", "- [ ] a");
    const e2 = store.track("tasks.md", "line:2", "- [ ] b");
    store.track("other.md", "__whole__", "x");

    expect(store.list("tasks.md")).toEqual({ "line:1": e1, "line:2": e2 });
    expect(Object.keys(store.list("other.md"))).toEqual(["__whole__"]);
  });
});
