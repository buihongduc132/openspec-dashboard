import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn utility (unit)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "no", true && "yes")).toBe("base yes");
  });

  it("deduplicates tailwind conflicts (tailwind-merge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles undefined and null gracefully", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });
});
