/**
 * Task 6.1 — `WatcherRegistry`.
 *
 * A module-level registry of chokidar watchers keyed by `projectId` (design
 * D3). One watcher per local project isolates blast radius (one repo's churn
 * doesn't re-scan others) and matches the per-project DB partitioning. Lazy
 * start avoids watching 100 repos when only 5 are enrolled.
 *
 * Responsibilities (content-projection spec, "A chokidar watcher SHALL keep
 * projection fresh per local project"):
 *  - create a chokidar watcher on `<rootPath>/openspec/...` the first time a
 *    local project is projected (startWatch);
 *  - debounce file events by 500ms before triggering an incremental
 *    projection (design D3 / task 6.4);
 *  - cap the number of concurrently open watchers (default 50); overflow is
 *    refused with a warning and the caller falls back to manual re-project;
 *  - close + remove a watcher on project deletion (stopWatch).
 *
 * This module owns the watcher lifecycle only. The `onEvent` callback is
 * injected by the caller (the projection wiring calls `queue.enqueue`), so
 * this module has no dependency on the queue or the DB and is trivially
 * unit-testable with a mocked chokidar.
 */
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import path from "node:path";

/** Default cap on concurrently open watchers (spec default). */
export const DEFAULT_WATCHER_CAP = 50;

/** File-event debounce window (ms). */
export const WATCHER_DEBOUNCE_MS = 500;

/**
 * Path segment the dashboard writes under (relative to a project root). The
 * watcher ignores this subtree so the dashboard never re-projects in response
 * to its own emitted files (content-projection spec: "The watcher SHALL
 * ignore the dashboard's own writes").
 */
const DASHBOARD_DIR = ".openspec-dashboard";

/**
 * The dashboard process's own repo root, if discoverable. Watched project
 * trees that happen to include this path are ignored so the dashboard does
 * not watch itself. Resolved lazily from `process.cwd()` (overridable for
 * tests via the options bag passed to `startWatch`).
 */
function dashboardOwnRoot(override?: string): string | null {
  const root = override ?? process.cwd();
  try {
    return path.resolve(root);
  } catch {
    return null;
  }
}

/**
 * chokidar `ignored` predicate (task 6.3): returns `true` for paths the
 * dashboard itself writes, so they never trigger a re-projection.
 *
 * Matches any path containing the `.openspec-dashboard` segment, or any path
 * rooted under the dashboard process's own repo directory.
 */
export function isDashboardWrite(
  testPath: string,
  ownRootOverride?: string,
): boolean {
  if (!testPath) return false;
  // Normalize to forward slashes: chokidar emits forward slashes, but
  // path.resolve produces platform-specific separators (backslashes on
  // Windows). Comparing cross-format paths would miss matches on Windows.
  const normalizedPath = testPath.replace(/\\/g, "/");
  // Match the dashboard cache dir anywhere in the path (segment boundary).
  if (
    normalizedPath === DASHBOARD_DIR ||
    normalizedPath.startsWith(`${DASHBOARD_DIR}/`) ||
    normalizedPath.includes(`/${DASHBOARD_DIR}/`) ||
    normalizedPath.endsWith(`/${DASHBOARD_DIR}`)
  ) {
    return true;
  }
  const own = dashboardOwnRoot(ownRootOverride);
  const ownNorm = own ? own.replace(/\\/g, "/") : null;
  if (ownNorm && (normalizedPath === ownNorm || normalizedPath.startsWith(`${ownNorm}/`))) {
    return true;
  }
  return false;
}

/** Callback fired (debounced) when a watched project's tree changes. */
export type WatchEventCallback = (projectId: string) => void;

interface RegisteredWatcher {
  projectId: string;
  rootPath: string;
  watcher: FSWatcher;
  /** Pending debounce timer, so stop can cancel an in-flight fire. */
  timer: NodeJS.Timeout | null;
  /** Last callback injected at start time. */
  onEvent: WatchEventCallback;
  /** Resolves once chokidar's `ready` event fires (inotify watches set up). */
  ready: Promise<void>;
  /**
   * In-process set of just-written absolute paths (design D0-2). The atomic-
   * write layer announces a path BEFORE its rename via {@link markSelfWrite};
   * the 'all' handler consumes the marker on the next event for that path so
   * the watcher never re-reconciles its own write (spec scenario "Watcher
   * self-write suppression").
   */
  selfWrite: Set<string>;
}

// Module-level registry (design D3: keyed by projectId).
const registry = new Map<string, RegisteredWatcher>();

/**
 * ProjectIds whose watcher has died (chokidar `error`/unexpected close). The
 * health endpoint reads this to emit a `degraded` indicator (api-foundation
 * spec scenario "Health degrades gracefully on a watcher failure") rather
 * than reporting fully ok.
 */
const unhealthy = new Set<string>();

/** ProjectIds whose filesystem watcher has died since startup. */
export function unhealthyWatchers(): string[] {
  return [...unhealthy];
}

/** Mark a watcher as unhealthy (called on chokidar error/close). */
function markUnhealthy(projectId: string): void {
  unhealthy.add(projectId);
}

/** Clear the unhealthy set (test helper / shutdown). */
export function resetUnhealthyWatchers(): void {
  unhealthy.clear();
}

/** Number of watchers currently registered. */
export function watcherCount(): number {
  return registry.size;
}

/** Whether a watcher is registered for the given project. */
export function isWatching(projectId: string): boolean {
  return registry.has(projectId);
}

/**
 * Start a chokidar watcher on `<rootPath>/openspec/...` for `projectId`.
 * Returns `true` when a watcher was created (or already existed) and `false`
 * when the cap was exceeded (a warning is logged and the caller should fall
 * back to manual re-project only).
 *
 * File events are debounced by {@link WATCHER_DEBOUNCE_MS} before `onEvent`
 * fires, so a burst of writes coalesces into one incremental projection.
 */
export function startWatch(
  projectId: string,
  rootPath: string,
  onEvent: WatchEventCallback,
  options: { cap?: number } = {},
): boolean {
  if (registry.has(projectId)) {
    return true;
  }
  const cap = options.cap ?? DEFAULT_WATCHER_CAP;
  if (registry.size >= cap) {
    console.warn(
      `WatcherRegistry: cap of ${cap} reached; not watching project "${projectId}" — use manual re-project instead.`,
    );
    return false;
  }

  const entry: RegisteredWatcher = {
    projectId,
    rootPath,
    watcher: null as unknown as FSWatcher,
    timer: null,
    onEvent,
    selfWrite: new Set<string>(),
    // Overwritten below once the chokidar `ready` promise is created.
    ready: Promise.resolve(),
  };

  const debounce = (): void => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      try {
        onEvent(projectId);
      } catch (err) {
        console.warn(
          `WatcherRegistry: onEvent for "${projectId}" threw —`,
          err,
        );
      }
    }, WATCHER_DEBOUNCE_MS);
  };

  // chokidar requires forward slashes in glob patterns; path.join would
  // emit backslashes on Windows and break matching.
  const openspecGlob = "openspec/**/*";
  const watcher = watch(openspecGlob, {
    cwd: rootPath,
    ignoreInitial: true,
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: WATCHER_DEBOUNCE_MS },
    ignored: (testPath: string) => isDashboardWrite(testPath),
  });
  // `watch()` returns FSWatcher synchronously (v3) — events can be subscribed
  // immediately. chokidar resolves `ready` after the initial scan (inotify
  // watches in place). Capture that as a promise so callers (and tests) can
  // await readiness before relying on change events.
  const ready = new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });
  watcher.on("all", (_event, filePath) => {
    // Self-write suppression (spec scenario "Watcher self-write suppression",
    // design D0-2): if the atomic-write layer just renamed this file, consume
    // the marker and skip the debounced reconciliation entirely.
    if (filePath && consumeSelfWrite(entry, filePath)) return;
    debounce();
  });
  // chokidar emits `error` events (e.g. ENOSPC inotify limit). Without a
  // listener Node treats them as unhandled and crashes the process. An error
  // also means the watcher is no longer reliably observing the tree, so mark
  // the project unhealthy for the /health degraded indicator.
  watcher.on("error", (err) => {
    markUnhealthy(projectId);
    console.warn(
      `WatcherRegistry: chokidar error for "${projectId}" —`,
      err,
    );
  });
  entry.watcher = watcher;
  entry.ready = ready;
  registry.set(projectId, entry);
  return true;
}

/**
 * Close + remove the watcher for `projectId` (project deletion path). Cancels
 * any pending debounced event so no stale projection fires after close.
 * Resolves when chokidar's underlying file handles are released.
 */
export async function stopWatch(projectId: string): Promise<void> {
  const entry = registry.get(projectId);
  if (!entry) return;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  registry.delete(projectId);
  // An explicit stop is an intentional teardown, not a death — do NOT mark
  // unhealthy (only chokidar errors / unexpected close do that).
  await entry.watcher.close().catch(() => {
    /* ignore — closing a half-dead watcher is best-effort */
  });
}

/**
 * Resolve when the watcher for `projectId` has fired chokidar's `ready`
 * event (its inotify watches are installed and it is now observing changes).
 * Resolves immediately when no watcher is registered or it is already ready.
 * Useful for deterministic live-edit tests that must not race watcher startup.
 */
export function watcherReady(projectId: string): Promise<void> {
  const entry = registry.get(projectId);
  return entry ? entry.ready : Promise.resolve();
}

/** Close + remove every watcher (test helper / shutdown). */
export async function stopAllWatchers(): Promise<void> {
  const ids = [...registry.keys()];
  await Promise.all(ids.map(stopWatch));
}

/**
 * Normalize an absolute path for cross-platform self-write marker comparison
 * (chokidar emits forward slashes; path.resolve uses platform separators).
 */
function normalizeAbs(absolutePath: string): string {
  return absolutePath.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Announce that the server is about to atomically write `absolutePath` for
 * `projectId` (design D0-2). The next chokidar event for that path is
 * suppressed so the watcher does not redundantly reconcile its own write.
 *
 * `absolutePath` MUST be absolute (resolved against the project root). The
 * atomic-write layer is expected to call this immediately BEFORE the rename.
 */
export function markSelfWrite(projectId: string, absolutePath: string): void {
  const entry = registry.get(projectId);
  if (!entry) return;
  entry.selfWrite.add(normalizeAbs(absolutePath));
}

/** Whether a self-write marker is currently pending for `absolutePath`. */
export function isSelfWriteMarked(
  projectId: string,
  absolutePath: string,
): boolean {
  const entry = registry.get(projectId);
  return entry ? entry.selfWrite.has(normalizeAbs(absolutePath)) : false;
}

/** Manually clear a self-write marker (e.g. if the write was rolled back). */
export function clearSelfWrite(
  projectId: string,
  absolutePath: string,
): void {
  const entry = registry.get(projectId);
  if (!entry) return;
  entry.selfWrite.delete(normalizeAbs(absolutePath));
}

/**
 * Consume a pending self-write marker for `filePath` (which may be relative
 * to the watcher's `cwd`). Returns `true` when a marker was present and
 * consumed (the event should be suppressed), `false` otherwise.
 */
function consumeSelfWrite(entry: RegisteredWatcher, filePath: string): boolean {
  if (entry.selfWrite.size === 0) return false;
  const absolute = normalizeAbs(path.resolve(entry.rootPath, filePath));
  return entry.selfWrite.delete(absolute);
}

/** Drop all registry entries WITHOUT closing watchers (test helper). */
export function resetWatcherRegistry(): void {
  registry.clear();
  unhealthy.clear();
}
