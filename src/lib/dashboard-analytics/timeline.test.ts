import { describe, it, expect } from "vitest";

/**
 * Task 2.22 — Change activity timeline (req 7.3).
 *
 * The timeline renders a chronological feed of audit-log events (change
 * created, artifact edited, task completed, validation run, archive, restore).
 * AC 7.3(a): each event deep-links to the affected entity.
 *
 * The pure `describeActivityEvent` helper maps a raw audit-log event into a
 * display descriptor { type, label, href, actor } — the behavioural core that
 * drives deep-linking and filtering in the timeline component.
 */
import { describeActivityEvent } from "./timeline";

const base = {
  projectId: "p1",
  details: "Implement login flow",
  author: "alice",
};

describe("describeActivityEvent (task 2.22, req 7.3)", () => {
  it("maps a task.completed event to a deep link + human label", () => {
    const ev = describeActivityEvent({
      ...base,
      action: "task.completed",
      entityType: "task",
      entityId: "t1",
    });
    expect(ev.label.toLowerCase()).toContain("completed");
    expect(ev.href).toContain("/projects/p1");
    expect(ev.type).toBe("task.completed");
    expect(ev.actor).toBe("alice");
  });

  it("maps change.created to the change detail route", () => {
    const ev = describeActivityEvent({
      ...base,
      action: "change.created",
      entityType: "change",
      entityId: "c1",
    });
    expect(ev.href).toContain("/changes/c1");
    expect(ev.label.toLowerCase()).toContain("created");
  });

  it("maps artifact edit events for changes", () => {
    const ev = describeActivityEvent({
      ...base,
      action: "artifact.edited",
      entityType: "change",
      entityId: "c1",
    });
    expect(ev.href).toContain("/changes/c1");
    expect(ev.label.toLowerCase()).toContain("artifact");
  });

  it("maps archive + restore events", () => {
    const archived = describeActivityEvent({
      ...base,
      action: "change.archived",
      entityType: "change",
      entityId: "c1",
    });
    expect(archived.label.toLowerCase()).toMatch(/archiv/);
    const restored = describeActivityEvent({
      ...base,
      action: "change.restored",
      entityType: "change",
      entityId: "c1",
    });
    expect(restored.label.toLowerCase()).toMatch(/restor/);
  });

  it("maps a validation.run event", () => {
    const ev = describeActivityEvent({
      ...base,
      action: "validation.run",
      entityType: "project",
      entityId: "p1",
    });
    expect(ev.label.toLowerCase()).toContain("validation");
  });

  it("falls back gracefully for unknown action types", () => {
    const ev = describeActivityEvent({
      ...base,
      action: "mystery.event",
      entityType: "thing",
      entityId: "y",
    });
    expect(ev.label).toBeTruthy();
    // Unknown entities have no deep link.
    expect(ev.href).toBeNull();
    expect(ev.type).toBe("mystery.event");
  });

  it("treats a null author as unattributed", () => {
    const ev = describeActivityEvent({
      projectId: "p1",
      action: "task.completed",
      entityType: "task",
      entityId: "t1",
      details: null,
      author: null,
    });
    expect(ev.actor).toBe("Unattributed");
  });
});
