/**
 * Task 4.2 — projection scanner.
 *
 * `scanProjectTree(rootPath)` performs a single synchronous walk of
 * `<rootPath>/openspec/` and returns a typed tree of artifact locations for the
 * parse-runner (task 4.3) and the upsert layer (task 4.4) to consume. It does
 * NOT parse file contents and does NOT touch the database — it only locates
 * files.
 *
 * Non-existent roots (and roots without an `openspec/` directory) are reported
 * as a skip with an explicit human-readable reason rather than throwing, per
 * the content-projection spec ("Project whose rootPath does not exist").
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** A main spec under `openspec/specs/<capability>/spec.md`. */
export interface ScannedSpecFile {
  capability: string;
  /** Absolute path to the `spec.md` file. */
  path: string;
}

/** A delta spec under `openspec/changes/[archive/]<name>/specs/<domain>/spec.md`. */
export interface ScannedDeltaFile {
  domain: string;
  /** Absolute path to the delta `spec.md`. */
  path: string;
}

/** An active or archived change directory and its discovered artifacts. */
export interface ScannedChange {
  /** Directory name (NOT including the `archive/` prefix). */
  name: string;
  archived: boolean;
  /** Absolute path to the change directory. */
  dir: string;
  proposalPath: string | null;
  designPath: string | null;
  tasksPath: string | null;
  deltaSpecs: ScannedDeltaFile[];
}

/** A tasks.md file, surfaced as a flat lookup for the parse-runner. */
export interface ScannedTaskFile {
  changeName: string;
  archived: boolean;
  /** Absolute path to `tasks.md`. */
  path: string;
}

/** Successful scan result. */
export interface ScanOk {
  ok: true;
  rootPath: string;
  /** Absolute path to the `openspec/` directory. */
  openspecDir: string;
  specs: ScannedSpecFile[];
  changes: ScannedChange[];
  archivedChanges: ScannedChange[];
  tasksByChange: Record<string, ScannedTaskFile>;
  configYamlPath: string | null;
}

/** Scan was skipped (root missing / not a directory / no openspec tree). */
export interface ScanSkipped {
  ok: false;
  rootPath: string;
  /** Human-readable reason; safe to store verbatim on `projects.projectionError`. */
  reason: string;
}

export type ScanResult = ScanOk | ScanSkipped;

const OPENSPEC_DIR = "openspec";

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

/** Enumerate delta specs and top-level artifacts within a change directory. */
function scanChangeDir(
  changeDir: string,
  name: string,
  archived: boolean,
): ScannedChange {
  const proposalPath = path.join(changeDir, "proposal.md");
  const designPath = path.join(changeDir, "design.md");
  const tasksPath = path.join(changeDir, "tasks.md");

  const deltaSpecs: ScannedDeltaFile[] = [];
  const specsRoot = path.join(changeDir, "specs");
  if (isDirectory(specsRoot)) {
    for (const domain of listDir(specsRoot)) {
      const domainDir = path.join(specsRoot, domain);
      if (!isDirectory(domainDir)) continue;
      const specFile = path.join(domainDir, "spec.md");
      if (existsSync(specFile)) {
        deltaSpecs.push({ domain, path: specFile });
      }
    }
  }

  return {
    name,
    archived,
    dir: changeDir,
    proposalPath: existsSync(proposalPath) ? proposalPath : null,
    designPath: existsSync(designPath) ? designPath : null,
    tasksPath: existsSync(tasksPath) ? tasksPath : null,
    deltaSpecs,
  };
}

/**
 * Walk `<rootPath>/openspec/` and return the typed artifact tree. Never throws
 * on missing/unreadable trees — returns a {@link ScanSkipped} instead.
 */
export function scanProjectTree(rootPath: string): ScanResult {
  if (!existsSync(rootPath) || !isDirectory(rootPath)) {
    return {
      ok: false,
      rootPath,
      reason: `project rootPath "${rootPath}" does not exist or is not a directory`,
    };
  }

  const openspecDir = path.join(rootPath, OPENSPEC_DIR);
  if (!isDirectory(openspecDir)) {
    return {
      ok: false,
      rootPath,
      reason: `no "openspec/" directory found under rootPath "${rootPath}"`,
    };
  }

  const specs: ScannedSpecFile[] = [];
  const changes: ScannedChange[] = [];
  const archivedChanges: ScannedChange[] = [];
  const tasksByChange: Record<string, ScannedTaskFile> = {};
  let configYamlPath: string | null = null;

  // --- specs/<capability>/spec.md ---
  const specsRoot = path.join(openspecDir, "specs");
  if (isDirectory(specsRoot)) {
    for (const capability of listDir(specsRoot)) {
      const capDir = path.join(specsRoot, capability);
      if (!isDirectory(capDir)) continue;
      const specFile = path.join(capDir, "spec.md");
      if (existsSync(specFile)) {
        specs.push({ capability, path: specFile });
      }
    }
  }

  // --- changes/<name>/ (excluding archive) + changes/archive/<dated-name>/ ---
  const changesRoot = path.join(openspecDir, "changes");
  if (isDirectory(changesRoot)) {
    for (const entry of listDir(changesRoot)) {
      const entryPath = path.join(changesRoot, entry);
      if (!isDirectory(entryPath)) continue;

      if (entry === "archive") {
        for (const datedName of listDir(entryPath)) {
          const datedDir = path.join(entryPath, datedName);
          if (!isDirectory(datedDir)) continue;
          archivedChanges.push(scanChangeDir(datedDir, datedName, true));
        }
        continue;
      }

      changes.push(scanChangeDir(entryPath, entry, false));
    }
  }

  // --- tasksByChange lookup (active + archived) ---
  for (const c of [...changes, ...archivedChanges]) {
    if (c.tasksPath) {
      tasksByChange[c.name] = {
        changeName: c.name,
        archived: c.archived,
        path: c.tasksPath,
      };
    }
  }

  // --- config.yaml ---
  const cfgPath = path.join(openspecDir, "config.yaml");
  if (existsSync(cfgPath)) {
    configYamlPath = cfgPath;
  }

  return {
    ok: true,
    rootPath,
    openspecDir,
    specs,
    changes,
    archivedChanges,
    tasksByChange,
    configYamlPath,
  };
}
