/**
 * Task 5.9 (RED) — Startup recovery for audit-file edge cases
 * (change `phase0-foundations`, spec `audit-chain`, req
 * "Tamper-detecting chain verifier" scenarios "Audit file missing on
 * startup", "Audit file partially written (mid-flush crash)",
 * "Audit file unreadable (permission error, disk corruption)").
 *
 * Three edge cases asserted here (exactly what task 5.9 enumerates):
 *
 *   1. File MISSING on startup → the chain is re-initialized from the fixed
 *      genesis hash; recovery reports `headHash === GENESIS_HASH` and does
 *      NOT enter quarantine. (Scenario "Audit file missing on startup".)
 *
 *   2. Partial-write temp file detected + deleted on restart; the chain
 *      resumes from the last fully-persisted entry (no partial entries in
 *      the live log). (Scenario "Audit file partially written (mid-flush
 *      crash)".) Covers BOTH the orphan temp sibling AND a trailing partial
 *      (unparseable) line in the live log.
 *
 *   3. Unreadable file (permission / IO error) → immediate quarantine +
 *      operator incident; recovery reports `status: "quarantined"` and the
 *      quarantine state is entered. (Scenario "Audit file unreadable".)
 *
 * The filesystem surface is injected (an in-memory fake) so the recovery
 * logic is unit-testable without touching a real disk, mirroring the
 * append-queue / verifier test pattern.
 */
import { describe, expect, it } from "vitest";
import {
  appendEntry,
  GENESIS_HASH,
  type ChainEntry,
  type EntryBody,
} from "./chain";
import {
  recoverAuditFile,
  type AuditRecoveryFs,
} from "./recovery";
import {
  createQuarantineState,
  type QuarantineState,
} from "./quarantine";

/** A valid chained entry body parameterized by an index. */
function body(i: number): EntryBody {
  return {
    actor: "alice",
    action: "task.update",
    entity: `task:t-${i}`,
    beforeHash: "0".repeat(8),
    afterHash: "f".repeat(8),
    timestamp: 1_700_000_000_000 + i,
    requestId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  };
}

/** Build a synthetic on-disk chain of `n` entries and return the full + last. */
function buildChainLines(n: number): { lines: string[]; entries: ChainEntry[] } {
  const chain: ChainEntry[] = [];
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const entry = appendEntry(chain, body(i));
    chain.push(entry);
    lines.push(JSON.stringify(entry));
  }
  return { lines, entries: chain };
}

/**
 * In-memory fake filesystem keyed by absolute path. `readFile` throws with a
 * caller-configurable error code per path (used to simulate an unreadable
 * file). Supports `readdir`, `unlink`, and `writeFile`.
 */
function makeFakeFs(): AuditRecoveryFs & {
  files: Map<string, string>;
  setUnreadable(path: string, code: string): void;
} {
  const files = new Map<string, string>();
  const unreadable = new Map<string, string>();
  const fs: AuditRecoveryFs & {
    files: Map<string, string>;
    setUnreadable(path: string, code: string): void;
  } = {
    files,
    setUnreadable(path, code) {
      unreadable.set(path, code);
    },
    async readdir(dir) {
      // Return basenames of every file whose path starts with `dir/`.
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const out: string[] = [];
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          out.push(key.slice(prefix.length));
        }
      }
      return out;
    },
    async readFile(path) {
      const code = unreadable.get(path);
      if (code !== undefined) {
        const err: NodeJS.ErrnoException = new Error(`${code}: ${path}`);
        err.code = code;
        throw err;
      }
      const v = files.get(path);
      if (v === undefined) {
        const err: NodeJS.ErrnoException = new Error(`ENOENT: ${path}`);
        err.code = "ENOENT";
        throw err;
      }
      return v;
    },
    async unlink(path) {
      files.delete(path);
    },
    async writeFile(path, data) {
      files.set(path, data);
    },
  };
  return fs;
}

function pathFor(projectId: string): string {
  return `/sidecar/audit/${projectId}.log`;
}

function dirFor(projectId: string): string {
  return `/sidecar/audit`;
}

describe("audit recovery — file missing on startup re-inits from genesis", () => {
  it("returns GENESIS_HASH and does NOT quarantine when the audit file is absent", async () => {
    const fs = makeFakeFs();
    const quarantine = createQuarantineState();

    const result = await recoverAuditFile("p-1", {
      fs,
      pathResolver: pathFor,
      dirResolver: dirFor,
      quarantine,
    });

    expect(result.status).toBe("recovered");
    if (result.status !== "recovered") return;
    expect(result.headHash).toBe(GENESIS_HASH);
    expect(result.tempFilesDeleted).toEqual([]);
    expect(result.partialTruncated).toBe(false);
    // No quarantine entered for a simply-missing file.
    expect(quarantine.active()).toBe(false);
  });
});

describe("audit recovery — partial-write temp file detected + deleted, chain resumes from last full entry", () => {
  it("deletes an orphan temp sibling and resumes from the last full entry", async () => {
    const fs = makeFakeFs();
    const quarantine = createQuarantineState();
    const { lines, entries } = buildChainLines(3);
    const live = pathFor("p-1");
    fs.files.set(live, `${lines.join("\n")}\n`);
    // Orphan temp file left by a crashed atomic append.
    const temp = `${live}.tmp`;
    fs.files.set(temp, JSON.stringify(entries[2]) /* half-baked */);

    const result = await recoverAuditFile("p-1", {
      fs,
      pathResolver: pathFor,
      dirResolver: dirFor,
      quarantine,
    });

    expect(result.status).toBe("recovered");
    if (result.status !== "recovered") return;
    expect(result.tempFilesDeleted).toContain(temp);
    // The temp file is gone from the fake FS.
    expect(fs.files.has(temp)).toBe(false);
    // Head is the last FULLY-persisted entry.
    expect(result.headHash).toBe(entries[entries.length - 1].hash);
    expect(quarantine.active()).toBe(false);
  });

  it("truncates a trailing partial (unparseable) line so no partial entry stays in the live log", async () => {
    const fs = makeFakeFs();
    const quarantine = createQuarantineState();
    const { lines, entries } = buildChainLines(2);
    const live = pathFor("p-1");
    // Append a truncated/partial line (invalid JSON) after the good entries.
    // The actor is intentionally distinct from the valid entries' `alice` so
    // the assertion can reliably detect that the partial bytes were removed.
    const partialLine = '{"body":{"actor":"partial-victim","action":"task.update","ent';
    fs.files.set(live, `${lines.join("\n")}\n${partialLine}\n`);

    const result = await recoverAuditFile("p-1", {
      fs,
      pathResolver: pathFor,
      dirResolver: dirFor,
      quarantine,
    });

    expect(result.status).toBe("recovered");
    if (result.status !== "recovered") return;
    expect(result.partialTruncated).toBe(true);
    expect(result.headHash).toBe(entries[entries.length - 1].hash);
    // The live log was rewritten WITHOUT the partial line.
    const rewritten = fs.files.get(live) ?? "";
    expect(rewritten).not.toContain(partialLine);
    expect(rewritten.trim().split("\n")).toHaveLength(lines.length);
    expect(quarantine.active()).toBe(false);
  });
});

describe("audit recovery — unreadable file enters immediate quarantine + operator incident", () => {
  it("enters quarantine when the audit file exists but cannot be read (EACCES)", async () => {
    const fs = makeFakeFs();
    const quarantine = createQuarantineState();
    const live = pathFor("p-1");
    // File exists on disk...
    fs.files.set(live, "whatever");
    // ...but is unreadable due to a permission error.
    fs.setUnreadable(live, "EACCES");

    const result = await recoverAuditFile("p-1", {
      fs,
      pathResolver: pathFor,
      dirResolver: dirFor,
      quarantine,
    });

    expect(result.status).toBe("quarantined");
    if (result.status !== "quarantined") return;
    expect(result.projectId).toBe("p-1");
    expect(result.cause).toContain("EACCES");
    // Quarantine was entered immediately (operator incident).
    expect(quarantine.active()).toBe(true);
    const status = quarantine.status();
    expect(status.active).toBe(true);
    if (status.active && status.reason) {
      expect(status.reason.projectId).toBe("p-1");
    }
  });

  it("enters quarantine on an IO/disk error (EIO) too", async () => {
    const fs = makeFakeFs();
    const quarantine = createQuarantineState();
    const live = pathFor("p-1");
    fs.files.set(live, "whatever");
    fs.setUnreadable(live, "EIO");

    const result = await recoverAuditFile("p-1", {
      fs,
      pathResolver: pathFor,
      dirResolver: dirFor,
      quarantine,
    });

    expect(result.status).toBe("quarantined");
    if (result.status !== "quarantined") return;
    expect(result.cause).toContain("EIO");
    expect(quarantine.active()).toBe(true);
  });
});
