// Task 4.1 (cycle 1) — projection hash utilities.
//
// contentHash(bytes) → SHA-256 hex; canonicalize(content) normalizes \r\n → \n.
// These power the incremental-skip behaviour (D2) so unchanged files are
// neither re-parsed nor re-upserted on subsequent projection runs.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { contentHash, canonicalize } from "@/lib/projection/hash";

describe("task 4.1 — canonicalize", () => {
  it("normalizes CRLF to LF", () => {
    expect(canonicalize("a\r\nb\r\n")).toBe("a\nb\n");
  });

  it("leaves already-LF text untouched", () => {
    expect(canonicalize("a\nb\n")).toBe("a\nb\n");
  });

  it("strips a lone trailing CR", () => {
    expect(canonicalize("a\rb\r\n")).toBe("a\nb\n");
  });
});

describe("task 4.1 — contentHash", () => {
  it("returns a 64-char lowercase hex SHA-256", () => {
    const h = contentHash("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches node crypto SHA-256 of the canonicalized bytes", () => {
    const input = "line1\r\nline2\n";
    const canonical = "line1\nline2\n";
    const expected = createHash("sha256").update(canonical, "utf8").digest("hex");
    expect(contentHash(input)).toBe(expected);
  });

  it("is stable: same content → same hash", () => {
    expect(contentHash("same\r\ncontent")).toBe(contentHash("same\ncontent"));
  });

  it("is empty-content safe (returns a hash, never throws)", () => {
    expect(contentHash("")).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash("")).toBe(
      createHash("sha256").update("", "utf8").digest("hex"),
    );
  });
});
