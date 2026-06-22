/**
 * Task 2.18 — Task sidecar JSON (`openspec/.dashboard/tasks/<change>.json`)
 * + migrator (req 04 §4.1, D-StableTaskIDs).
 *
 * The Markdown `tasks.md` is the display layer; the sidecar JSON at
 * `openspec/.dashboard/tasks/<change>.json` is the identity layer. The
 * migrator walks the parsed Markdown tuples and assigns stable UUIDs at
 * first-seen, preserving existing UUIDs on subsequent runs.
 */
import { describe, it, expect } from "vitest";
import {
  SIDECAR_VERSION,
  SIDECAR_DIR,
  sidecarPath,
  emptySidecar,
  serializeSidecar,
  parseSidecar,
  migrateSidecar,
  type SidecarTaskTuple,
  type SidecarFile,
} from "@/lib/tasks-sidecar";

describe("Task 2.18 — Sidecar path + format (req 04 §4.1)", () => {
  it("resolves the canonical sidecar path under openspec/.dashboard/tasks/", () => {
    expect(sidecarPath("/repo", "add-rbac")).toBe(
      "/repo/openspec/.dashboard/tasks/add-rbac.json",
    );
  });

  it("exposes the dashboard sidecar directory constant", () => {
    expect(SIDECAR_DIR).toBe("openspec/.dashboard/tasks");
  });

  it("uses a stable schema version", () => {
    expect(SIDECAR_VERSION).toBe(1);
  });

  it("emptySidecar has version, change name, and empty task list", () => {
    const s = emptySidecar("add-rbac");
    expect(s.version).toBe(1);
    expect(s.change).toBe("add-rbac");
    expect(s.tasks).toEqual([]);
  });
});

describe("Task 2.18 — Serialization round-trip", () => {
  it("serializes to stable, pretty JSON", () => {
    const s: SidecarFile = {
      version: 1,
      change: "add-rbac",
      tasks: [
        { uuid: "11111111-1111-4111-8111-111111111111", parentChain: [], prose: "first" },
      ],
    };
    const text = serializeSidecar(s);
    expect(text).toContain('"version": 1');
    expect(text).toContain('"11111111-1111-4111-8111-111111111111"');
    expect(text.endsWith("\n")).toBe(true);
  });

  it("parseSidecar round-trips serializeSidecar", () => {
    const s = emptySidecar("add-rbac");
    s.tasks.push({
      uuid: "22222222-2222-4222-8222-222222222222",
      parentChain: ["1. Foundations"],
      prose: "do the thing",
    });
    expect(parseSidecar(serializeSidecar(s))).toEqual(s);
  });

  it("parseSidecar rejects a wrong schema version", () => {
    expect(() =>
      parseSidecar(JSON.stringify({ version: 99, change: "x", tasks: [] })),
    ).toThrow(/version/);
  });
});

describe("Task 2.18 — Migrator assigns + preserves UUIDs (D-StableTaskIDs)", () => {
  const tuple = (prose: string, parentChain: string[] = []): SidecarTaskTuple => ({
    parentChain,
    prose,
  });

  it("assigns a fresh UUID to every first-seen tuple", () => {
    const existing = emptySidecar("add-rbac");
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const out = migrateSidecar(
      existing,
      [tuple("deploy"), tuple("test"), tuple("ship")],
      uuid,
    );
    expect(out.tasks).toHaveLength(3);
    expect(out.tasks.map((t) => t.uuid).sort()).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });

  it("preserves existing UUIDs when the tuple matches again (stable identity)", () => {
    const existing = emptySidecar("add-rbac");
    existing.tasks.push({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parentChain: [],
      prose: "deploy",
    });
    const out = migrateSidecar(
      existing,
      [tuple("deploy")],
      () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(out.tasks).toHaveLength(1);
    // Stable: existing UUID preserved, fresh generator NOT called for it.
    expect(out.tasks[0].uuid).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("distinguishes identical prose under different parent chains", () => {
    const existing = emptySidecar("add-rbac");
    const out = migrateSidecar(
      existing,
      [tuple("deploy", ["Phase A"]), tuple("deploy", ["Phase B"])],
      (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(out.tasks).toHaveLength(2);
    expect(out.tasks[0].uuid).not.toBe(out.tasks[1].uuid);
  });
});
