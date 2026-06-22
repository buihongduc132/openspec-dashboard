// Task 1.1 (cycle 1) — chokidar dependency is installed and importable.
//
// The content-projection watcher (tasks 6.x) needs chokidar to observe the
// openspec tree under a project root. Before that work, the dependency must be
// declared in package.json and resolvable from Node. This unit test is the
// RED/GREEN gate for task 1.1.
import { describe, it, expect } from "vitest";

describe("task 1.1 — chokidar dependency", () => {
  it("exports a `watch` function (the chokidar entry point)", async () => {
    const chokidar = await import("chokidar");
    expect(typeof chokidar.watch).toBe("function");
  });
});
