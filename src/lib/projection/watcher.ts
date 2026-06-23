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
  // Match the dashboard cache dir anywhere in the path (segment boundary).
  if (
    testPath === DASHBOARD_DIR ||
    testPath.startsWith(`${DASHBOARD_DIR}/`) ||
    testPath.includes(`/${DASHBOARD_DIR}/`) ||
    testPath.endsWith(`/${DASHBOARD_DIR}`)
  ) {
    return true;
  }
  const own = dashboardOwnRoot(ownRootOverride);
  if (own && (testPath === own || testPath.startsWith(`${own}/`))) {
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
}

// Module-level registry (design D3: keyed by projectId).
const registry = new Map<string, RegisteredWatcher>();

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

  const openspecGlob = path.join("openspec", "**", "*");
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
  watcher.on("all", () => debounce());
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

/** Drop all registry entries WITHOUT closing watchers (test helper). */
export function resetWatcherRegistry(): void {
  registry.clear();
}
