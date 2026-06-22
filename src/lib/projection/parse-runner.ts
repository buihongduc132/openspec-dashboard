/**
 * Task 4.3 — projection parse-runner.
 *
 * Consumes a {@link ScanOk} tree and runs the appropriate
 * `openspec-parser` entry point per discovered file, collecting
 * `{ model, issues, hash }` per file. The runner is the bridge between the
 * pure-FS {@link scanProjectTree} and the DB upsert layer (task 4.4): it owns
 * no I/O of its own and accepts an injected file reader so it is trivially
 * unit-testable and deterministic.
 *
 * Errors are collected, never thrown (design D5): an unreadable file becomes a
 * single `error`-severity {@link ParseIssue} and the run continues with the
 * remaining files.
 */
import { readFileSync } from "node:fs";
import {
  parseMainSpec,
  parseDeltaSpec,
  parseTasks,
  parseConfigYaml,
} from "@/lib/openspec-parser";
import type {
  ParseIssue,
  MainSpecModel,
  DeltaPlan,
  TaskItem,
  ConfigModel,
} from "@/lib/openspec-parser/types";
import type { ScanOk } from "@/lib/projection/scanner";
import { contentHash } from "@/lib/projection/hash";

/** Reads file contents as UTF-8 text. Injectable for tests. */
export type FileReader = (filePath: string) => string;

/** Default reader backed by `fs.readFileSync`. */
export function readFileSyncUtf8(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

export interface ParsedSpecFile {
  kind: "spec";
  filePath: string;
  /** Canonicalized raw file text (populated for the upsert layer). */
  content: string;
  hash: string;
  model: MainSpecModel;
  issues: ParseIssue[];
}

export interface ParsedDeltaFile {
  kind: "delta";
  filePath: string;
  /** Canonicalized raw file text (populated for the upsert layer). */
  content: string;
  hash: string;
  changeName: string;
  archived: boolean;
  domain: string;
  plan: DeltaPlan;
  issues: ParseIssue[];
}

export interface ParsedTasksFile {
  kind: "tasks";
  filePath: string;
  /** Canonicalized raw file text (populated for the upsert layer). */
  content: string;
  hash: string;
  changeName: string;
  archived: boolean;
  items: TaskItem[];
  issues: ParseIssue[];
}

export interface ParsedConfigFile {
  kind: "config";
  filePath: string;
  hash: string;
  model: ConfigModel;
  issues: ParseIssue[];
}

export type ParsedFile =
  | ParsedSpecFile
  | ParsedDeltaFile
  | ParsedTasksFile
  | ParsedConfigFile;

export interface ParseRunResult {
  files: ParsedFile[];
  /** Every issue from every file, in scan order. */
  issues: ParseIssue[];
}

/**
 * Run the parser over every file in the scan tree.
 *
 * File kinds and the parser dispatched:
 *  - `specs/<cap>/spec.md`      → {@link parseMainSpec}
 *  - change delta `specs/<d>/spec.md` → {@link parseDeltaSpec}
 *  - change `tasks.md`          → {@link parseTasks}
 *  - root `config.yaml`         → {@link parseConfigYaml}
 */
export function runParsers(scan: ScanOk, read: FileReader): ParseRunResult {
  const files: ParsedFile[] = [];
  const issues: ParseIssue[] = [];

  // --- main specs ---
  for (const spec of scan.specs) {
    const parsed = parseOne(spec.path, (content) => {
      const { model, issues } = parseMainSpec(content, spec.path);
      return { content, hash: contentHash(content), model, issues };
    }, read);
    if (parsed) {
      files.push({ kind: "spec", filePath: spec.path, content: parsed.content, hash: parsed.hash, model: parsed.model, issues: parsed.issues });
      issues.push(...parsed.issues);
    } else {
      issues.push(readIssue(spec.path));
    }
  }

  // --- changes: deltas + tasks (active and archived) ---
  for (const change of [...scan.changes, ...scan.archivedChanges]) {
    for (const delta of change.deltaSpecs) {
      const parsed = parseOne(delta.path, (content) => {
        const { plan, issues } = parseDeltaSpec(content, delta.path);
        return { content, hash: contentHash(content), plan, issues };
      }, read);
      if (parsed) {
        files.push({
          kind: "delta",
          filePath: delta.path,
          content: parsed.content,
          hash: parsed.hash,
          changeName: change.name,
          archived: change.archived,
          domain: delta.domain,
          plan: parsed.plan,
          issues: parsed.issues,
        });
        issues.push(...parsed.issues);
      } else {
        issues.push(readIssue(delta.path));
      }
    }

    if (change.tasksPath) {
      const parsed = parseOne(change.tasksPath, (content) => {
        const { items, issues } = parseTasks(content, change.tasksPath as string);
        return { content, hash: contentHash(content), items, issues };
      }, read);
      if (parsed) {
        files.push({
          kind: "tasks",
          filePath: change.tasksPath,
          content: parsed.content,
          hash: parsed.hash,
          changeName: change.name,
          archived: change.archived,
          items: parsed.items,
          issues: parsed.issues,
        });
        issues.push(...parsed.issues);
      } else {
        issues.push(readIssue(change.tasksPath));
      }
    }
  }

  // --- config.yaml ---
  if (scan.configYamlPath) {
    const cfgPath = scan.configYamlPath;
    const parsed = parseOne(cfgPath, (content) => {
      const model = parseConfigYaml(content);
      return { hash: contentHash(content), model, issues: [] as ParseIssue[] };
    }, read);
    if (parsed) {
      files.push({ kind: "config", filePath: cfgPath, hash: parsed.hash, model: parsed.model, issues: [] });
    } else {
      issues.push(readIssue(cfgPath));
    }
  }

  return { files, issues };
}

/** Try to read+parse one file; return null on read/parse failure (issue recorded by caller). */
function parseOne<T>(
  filePath: string,
  parse: (content: string) => T & { issues: ParseIssue[] },
  read: FileReader,
): (T & { issues: ParseIssue[] }) | null {
  try {
    const content = read(filePath);
    return parse(content);
  } catch {
    return null;
  }
}

function readIssue(filePath: string): ParseIssue {
  return {
    kind: "unreadable-file",
    file: filePath,
    severity: "error",
    message: `Could not read or parse file "${filePath}"`,
  };
}
