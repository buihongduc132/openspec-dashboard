import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { EntityReference } from "@/lib/entity-reference/types";
import type { BuildRow } from "@/lib/entity-reference/build";

/**
 * Task 4.5 — List pages render a compact icon-only CopyReferenceButton on
 * every row for: projects, changes, specs, schemas, context-stores,
 * workspaces.
 *
 * "Icon-only variant" means the trigger shows only the copy glyph — the
 * "Copy reference" text label is NOT rendered inline (it stays reachable to
 * assistive tech via `aria-label`), so dense list rows stay compact. Each
 * row builds its reference from the already-fetched row (design D1: no extra
 * DB round-trip) via `buildEntityReference`.
 */

// ─── Shared chainable DB mock (driven by a per-test RESULTS queue) ────────────
//
// Every page in scope awaits `db.select()...` chains. Each chain method
// returns the same thenable builder; awaiting it (at `.where()`, `.orderBy()`,
// or `.from(...)`) pops the next pre-configured result from `RESULTS`.

let RESULTS: unknown[] = [];

function makeChainable(): Record<string, unknown> {
  const chain = (() => chain) as unknown as Record<string, unknown>;
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(RESULTS.shift() ?? []).then(
      onFulfilled as never,
      onRejected as never,
    );
  for (const m of [
    "select",
    "from",
    "where",
    "limit",
    "orderBy",
    "innerJoin",
    "leftJoin",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

vi.mock("@/db", () => ({
  db: new Proxy({} as Record<string, unknown>, {
    get: () => () => makeChainable(),
  }),
}));

const stubReference: EntityReference = {
  type: "project",
  id: "stub",
  title: "Stub",
  path: "/stub",
  readInstruction: "stub",
  metadata: {},
  generatedAt: "2026-06-19T00:00:00.000Z",
};

const buildSpy = vi.fn(
  (_type: string, _row: BuildRow, _ctx: unknown): EntityReference => stubReference,
);
vi.mock("@/lib/entity-reference/build", () => ({
  buildEntityReference: (type: string, row: BuildRow, ctx: unknown) =>
    buildSpy(type, row, ctx),
}));

vi.mock("@/lib/clipboard", () => ({
  copyText: vi.fn(async () => ({ ok: true, fallback: false })),
}));

// Shared row fixtures (only fields the pages read).
const projectRow = {
  id: "proj-1",
  name: "My Project",
  description: null,
  rootPath: "/repos/my-project",
  defaultSchema: "spec-driven",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const changeRow = {
  id: "change-1",
  name: "add-auth",
  status: "proposed",
  description: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  projectId: "proj-1",
  projectName: "My Project",
};

const specDomainRow = {
  id: "domain-1",
  name: "auth",
  purpose: "Auth spec",
  projectId: "proj-1",
  projectName: "My Project",
};

const schemaRow = {
  id: "schema-1",
  name: "spec-driven",
  description: null,
  isActive: true,
  source: "builtin",
  version: 1,
};

const contextStoreRow = {
  id: "ctx-1",
  name: "shared",
  path: "/repos/shared",
  hasGit: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const workspaceRow = {
  id: "ws-1",
  name: "mono",
  opener: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lacks pointer-capture APIs that Radix DropdownMenu calls.
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture = vi.fn(() => false);
  proto.setPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  RESULTS = [];
});

describe("List pages — icon-only Copy reference per row (task 4.5)", () => {
  it("projects list renders an icon-only Copy reference control per project card", async () => {
    // projects/page awaits: projects list, then per-project: changeCount,
    // activeChanges, domainCount, taskCount, doneCount.
    RESULTS = [
      [projectRow],
      [{ count: 0 }], // changeCount
      [], // activeChanges
      [{ count: 0 }], // domainCount
      [{ count: 0 }], // taskCount
      [{ count: 0 }], // doneCount
    ];
    const mod = await import("@/app/projects/page");
    const ui = await mod.default();
    render(ui);

    const buttons = screen.getAllByRole("button", { name: /copy reference/i });
    expect(buttons.length).toBe(1);
    // Icon-only: no inline "Copy reference" text label rendered.
    expect(screen.queryByText("Copy reference")).toBeNull();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy.mock.calls[0][0]).toBe("project");
  });

  it("changes list renders an icon-only Copy reference control per change row", async () => {
    // changes/page awaits: changes join, then per-change: artifacts,
    // taskCount, doneTasks.
    RESULTS = [
      [changeRow],
      [], // artifacts
      [{ count: 0 }], // taskCount
      [{ count: 0 }], // doneTasks
    ];
    const mod = await import("@/app/changes/page");
    const ui = await mod.default();
    render(ui);

    const buttons = screen.getAllByRole("button", { name: /copy reference/i });
    expect(buttons.length).toBe(1);
    expect(screen.queryByText("Copy reference")).toBeNull();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy.mock.calls[0][0]).toBe("change");
  });

  it("specs list renders an icon-only Copy reference control per spec domain", async () => {
    RESULTS = [[specDomainRow]];
    const mod = await import("@/app/specs/page");
    const ui = await mod.default();
    render(ui);

    const buttons = screen.getAllByRole("button", { name: /copy reference/i });
    expect(buttons.length).toBe(1);
    expect(screen.queryByText("Copy reference")).toBeNull();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy.mock.calls[0][0]).toBe("spec-domain");
  });

  it("schemas list renders an icon-only Copy reference control per schema", async () => {
    RESULTS = [[schemaRow]];
    const mod = await import("@/app/schemas/page");
    const ui = await mod.default();
    render(ui);

    const buttons = screen.getAllByRole("button", { name: /copy reference/i });
    expect(buttons.length).toBe(1);
    expect(screen.queryByText("Copy reference")).toBeNull();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy.mock.calls[0][0]).toBe("schema");
  });

  it("context-stores list renders an icon-only Copy reference control per store", async () => {
    // context-stores/page awaits: stores list, then per-store initiatives.
    RESULTS = [
      [contextStoreRow],
      [], // initiatives
    ];
    const mod = await import("@/app/context-stores/page");
    const ui = await mod.default();
    render(ui);

    const buttons = screen.getAllByRole("button", { name: /copy reference/i });
    expect(buttons.length).toBe(1);
    expect(screen.queryByText("Copy reference")).toBeNull();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy.mock.calls[0][0]).toBe("context-store");
  });

  it("workspaces list renders an icon-only Copy reference control per workspace", async () => {
    // workspaces/page awaits: workspaces list, then per-ws links.
    RESULTS = [
      [workspaceRow],
      [], // links
    ];
    const mod = await import("@/app/workspaces/page");
    const ui = await mod.default();
    render(ui);

    const buttons = screen.getAllByRole("button", { name: /copy reference/i });
    expect(buttons.length).toBe(1);
    expect(screen.queryByText("Copy reference")).toBeNull();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy.mock.calls[0][0]).toBe("workspace");
  });
});
