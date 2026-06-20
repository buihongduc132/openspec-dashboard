import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { EntityReference } from "@/lib/entity-reference/types";
import type { BuildRow } from "@/lib/entity-reference/build";

/**
 * Task 4.4 — Spec domain detail page renders a CopyReferenceButton for the
 * domain (built server-side from the domain row + project rootPath, design
 * D1) AND one CopyReferenceButton per requirement in the requirement list
 * (each built from its requirement row with the domain name threaded through
 * the context so the path resolver can derive `<rootPath>/openspec/specs/
 * <domainName>/spec.md` per the path-resolution table D8).
 *
 * We spy on `buildEntityReference` (the single canonical builder, D1) to
 * assert:
 *   - one "spec-domain" call seeded from the domain row,
 *   - one "requirement" call per requirement row,
 *   - the context for every call carries repoRoot/projectRootPath anchored
 *     on the project rootPath (D2) and the domainName for path resolution.
 */

// ─── Mock @/db with a chainable, thenable builder driven by a results queue ──
//
// The spec domain page issues ~5 awaited queries in a known order. Each
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

const domainRow = {
  id: "domain-1",
  projectId: "proj-1",
  name: "auth",
  purpose: "Authentication domain",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const specRow = {
  id: "spec-1",
  domainId: "domain-1",
  content: "spec body",
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const requirementRows = [
  {
    id: "req-1",
    specId: "spec-1",
    title: "Login requirement",
    body: "Users must log in",
    strength: "SHALL",
    orderIndex: 0,
    createdAt: new Date("2026-01-04T00:00:00.000Z"),
    updatedAt: new Date("2026-01-04T00:00:00.000Z"),
  },
  {
    id: "req-2",
    specId: "spec-1",
    title: "Logout requirement",
    body: "Users must log out",
    strength: "SHALL",
    orderIndex: 1,
    createdAt: new Date("2026-01-04T00:00:00.000Z"),
    updatedAt: new Date("2026-01-04T00:00:00.000Z"),
  },
];

// Ordered exactly as the page awaits them.
let RESULTS: unknown[] = [];
function makeChainable(): Record<string, unknown> {
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
    throw new Error("notFound() should not be called — project/domain exist");
  },
}));

const stubReference: EntityReference = {
  type: "spec-domain",
  id: "stub",
  title: "stub",
  path: "/repos/my-project/openspec/specs/auth/spec.md",
  readInstruction: "Read this spec.",
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

describe("Spec domain detail — Copy reference (task 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the DB results queue to the exact ordered set the page awaits:
    //   1) projects limit(1)   -> [projectRow]
    //   2) specDomains limit(1) -> [domainRow]
    //   3) domainSpecs (specs)  -> [specRow]
    //   4) reqs (requirements)  -> requirementRows
    //   5) allScenarios (scenarios) -> []
    RESULTS = [[projectRow], [domainRow], [specRow], requirementRows, []];
    // jsdom lacks pointer-capture APIs that Radix DropdownMenu calls.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture = vi.fn(() => false);
    proto.setPointerCapture = vi.fn();
    proto.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a Copy reference control for the domain built from the domain row + project rootPath", async () => {
    const mod = await import("@/app/projects/[id]/specs/[domainId]/page");
    const DomainSpecPage = mod.default;
    const ui = await DomainSpecPage({
      params: Promise.resolve({ id: "proj-1", domainId: "domain-1" }),
    });
    render(ui);

    // The spec-domain reference was built from the domain row.
    const domainCall = buildSpy.mock.calls.find((c) => c[0] === "spec-domain");
    expect(domainCall).toBeTruthy();
    const [, domainRowArg, domainCtx] = domainCall!;
    expect(domainRowArg).toMatchObject({
      id: "domain-1",
      name: "auth",
    });
    expect(domainCtx as Record<string, unknown>).toMatchObject({
      repoRoot: "/repos/my-project",
      projectRootPath: "/repos/my-project",
      projectName: "My Project",
      domainName: "auth",
    });
  });

  it("renders one Copy reference control per requirement, each built from its requirement row with the domain name in context", async () => {
    const mod = await import("@/app/projects/[id]/specs/[domainId]/page");
    const DomainSpecPage = mod.default;
    const ui = await DomainSpecPage({
      params: Promise.resolve({ id: "proj-1", domainId: "domain-1" }),
    });
    render(ui);

    // Two requirement references built (one per requirement row).
    const requirementCalls = buildSpy.mock.calls.filter(
      (c) => c[0] === "requirement",
    );
    expect(requirementCalls).toHaveLength(2);

    const requirementIds = requirementCalls.map((c) => (c[1] as { id: string }).id);
    expect(requirementIds).toEqual(["req-1", "req-2"]);

    for (const call of requirementCalls) {
      const [, row, ctx] = call;
      expect(row).toMatchObject({ title: expect.any(String) });
      expect(ctx as Record<string, unknown>).toMatchObject({
        domainName: "auth",
        repoRoot: "/repos/my-project",
        projectRootPath: "/repos/my-project",
      });
    }

    // Three copy controls total on the page (1 domain + 2 requirements).
    expect(
      screen.getAllByRole("button", { name: /copy reference/i }),
    ).toHaveLength(3);
  });
});
