import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { EntityReference } from "@/lib/entity-reference/types";
import type { BuildRow } from "@/lib/entity-reference/build";

/**
 * Task 4.3 — Change detail header renders a CopyReferenceButton seeded from
 * the change row + the project rootPath (design D1: server builds the
 * canonical reference from the already-fetched rows, no extra DB round-trip).
 *
 * We spy on `buildEntityReference` to assert the call args (type "change",
 * the change row, ctx carrying repoRoot/projectRootPath from the project row
 * and changeName from the change row), and assert the rendered control is
 * present in the header.
 */

// ─── Mock @/db with a chainable, thenable builder driven by a results queue ──
//
// The change detail page issues ~5 awaited queries in a known order. Each
// terminal await pulls the next pre-configured result array from `RESULTS`.
// Every chain method returns the same thenable builder so awaiting at
// `.where(...)` or `.limit(...)` both consume exactly one entry.

const projectRow = {
  id: "proj-1",
  name: "My Project",
  description: null,
  rootPath: "/repos/my-project",
  defaultSchema: "spec-driven",
  context: null,
  configYaml: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const changeRow = {
  id: "change-1",
  projectId: "proj-1",
  name: "add-auth",
  description: "Add authentication",
  status: "in-progress",
  owner: null,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

// Ordered exactly as the page awaits them.
let RESULTS: unknown[] = [];
function makeChainable(): Record<string, unknown> {
  // A callable that is also thenable and has all Drizzle chain methods. Every
  // method returns the same object so chained calls work; awaiting at any
  // terminal point (`.where(...)` or `.limit(...)`) consumes one entry from
  // the pre-configured RESULTS queue.
  const chain = (() => chain) as unknown as Record<string, unknown>;
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(RESULTS.shift() ?? []).then(
      onFulfilled as never,
      onRejected as never,
    );
  for (const m of ["select", "from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) {
    chain[m] = () => chain;
  }
  return chain;
}
vi.mock("@/db", () => ({
  db: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => {
      if (prop === "select") return () => makeChainable();
      return () => makeChainable();
    },
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound() should not be called — project/change exist");
  },
}));

const stubReference: EntityReference = {
  type: "change",
  id: "change-1",
  title: "add-auth",
  path: "/repos/my-project/openspec/changes/add-auth",
  readInstruction:
    "Read `proposal.md`, `design.md`, `tasks.md` in this change dir.",
  metadata: { name: "add-auth", status: "in-progress" },
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

describe("Change detail header — Copy reference (task 4.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the DB results queue to the exact ordered set the page awaits:
    //   1) projects limit(1)            -> [projectRow]
    //   2) changes limit(1)             -> [changeRow]
    //   3) artifacts                    -> []
    //   4) allTasks                     -> []
    //   5) doneCount count              -> [{ count: 0 }]
    RESULTS = [[projectRow], [changeRow], [], [], [{ count: 0 }]];
    // jsdom lacks pointer-capture APIs that Radix DropdownMenu calls.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture = vi.fn(() => false);
    proto.setPointerCapture = vi.fn();
    proto.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a Copy reference control in the change header built from the change row + project rootPath", async () => {
    const mod = await import(
      "@/app/projects/[id]/changes/[changeId]/page"
    );
    const ChangeDetailPage = mod.default;
    const ui = await ChangeDetailPage({
      params: Promise.resolve({ id: "proj-1", changeId: "change-1" }),
    });
    render(ui);

    // The Copy reference control is rendered in the header.
    expect(
      screen.getByRole("button", { name: /copy reference/i }),
    ).toBeTruthy();

    // The change reference was built once from the change row.
    expect(buildSpy).toHaveBeenCalledTimes(1);
    const [type, row, ctx] = buildSpy.mock.calls[0];
    expect(type).toBe("change");
    expect(row).toMatchObject({
      id: "change-1",
      name: "add-auth",
    });
    // The context anchors absolute paths on the project rootPath (D2/D8)
    // and carries the change name for the readInstruction.
    expect(ctx as Record<string, unknown>).toMatchObject({
      repoRoot: "/repos/my-project",
      projectRootPath: "/repos/my-project",
      projectName: "My Project",
      changeName: "add-auth",
    });
  });
});
