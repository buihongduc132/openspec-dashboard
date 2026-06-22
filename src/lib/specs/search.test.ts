/**
 * Task 2.15 — Spec full-text search unit tests (req 02 §2.7).
 *
 * Source: `flow/requirements/02-specs.md` §2.7. The dashboard provides
 * full-text search across all specs in a project, with filters by domain and
 * RFC 2119 strength. This module implements an in-memory FTS5-equivalent
 * ranking core (tokenisation + BM25-style scoring) that the DB-backed FTS5
 * index can mirror for offline/preview search.
 */
import { describe, it, expect } from "vitest";
import { searchSpecs, type SearchableSpec } from "@/lib/specs/search";

const SPECS: SearchableSpec[] = [
  {
    domain: "auth",
    requirements: [
      {
        name: "Login",
        body: "The system SHALL authenticate users with a password.",
        scenarios: [{ name: "Valid login", body: "- **WHEN** the password is correct" }],
      },
    ],
  },
  {
    domain: "tasks",
    requirements: [
      {
        name: "Kanban",
        body: "The system SHOULD render a kanban board with drag and drop.",
        scenarios: [],
      },
    ],
  },
];

describe("searchSpecs", () => {
  it("returns hits scoped to the matching requirement", () => {
    const hits = searchSpecs(SPECS, "password");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].domain).toBe("auth");
    expect(hits[0].requirement).toBe("Login");
  });

  it("ranks multiple matches by relevance score descending", () => {
    const specs: SearchableSpec[] = [
      {
        domain: "a",
        requirements: [
          { name: "R", body: "kanban kanban kanban", scenarios: [] },
        ],
      },
      {
        domain: "b",
        requirements: [
          { name: "R", body: "kanban once", scenarios: [] },
        ],
      },
    ];
    const hits = searchSpecs(specs, "kanban");
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
    expect(hits[0].domain).toBe("a");
  });

  it("filters by domain", () => {
    const hits = searchSpecs(SPECS, "system", { domains: ["tasks"] });
    expect(hits.every((h) => h.domain === "tasks")).toBe(true);
  });

  it("filters by RFC 2119 strength", () => {
    const shallHits = searchSpecs(SPECS, "system", { rfc2119: ["SHALL"] });
    expect(shallHits.every((h) => h.domain === "auth")).toBe(true);
    const shouldHits = searchSpecs(SPECS, "system", { rfc2119: ["SHOULD"] });
    expect(shouldHits.every((h) => h.domain === "tasks")).toBe(true);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchSpecs(SPECS, "nonexistenttermxyz")).toEqual([]);
  });

  it("tokenises case-insensitively and matches substrings of tokens", () => {
    const hits = searchSpecs(SPECS, "AUTHENTICATE");
    expect(hits.some((h) => h.domain === "auth")).toBe(true);
  });
});
