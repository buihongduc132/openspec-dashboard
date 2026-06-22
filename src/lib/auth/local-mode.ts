/**
 * Task 5.1 — Better-Auth integration: local-mode guard (req 09.1).
 *
 * Pure auth-mode resolution consumed by the server bind check and the UI
 * banner. Side-effect-free so the decision table is fully unit-testable.
 *
 *   - req 09.1 (a): refuse to bind to non-loopback interfaces in local mode
 *     without explicit opt-in (`--bind 0.0.0.0` requires `--allow-network`).
 *   - req 09.1 (b): a clear banner states "local mode — no auth".
 *
 * The DB / cookie / OAuth wiring is owned by the detailed phase3a tasks; this
 * is the foundational core (design D-3a1 / D-3a8).
 */

/** Loopback hostnames/addresses recognised as "local". */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/** True when `host` is a loopback address / `localhost` (case-insensitive). */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return LOOPBACK_HOSTS.has(normalized);
}

/** Inputs to auth-mode resolution. */
export interface AuthModeInput {
  /** The host the server is being asked to bind to. */
  bindHost: string;
  /** True when the operator passed `--allow-network` (explicit opt-in). */
  allowNetwork: boolean;
}

/** Resolved authentication mode. */
export type AuthMode = "local" | "multi";

/**
 * Resolve the authentication mode for a given bind configuration.
 *
 * - Loopback bind → `local` (single-user, no auth) — req 09.1 default.
 * - Non-loopback bind WITHOUT `--allow-network` → **throws** (refuses to bind,
 *   req 09.1 (a)).
 * - Non-loopback bind WITH `--allow-network` → `multi` (Better-Auth on).
 */
export function resolveAuthMode(input: AuthModeInput): AuthMode {
  if (isLoopbackHost(input.bindHost)) return "local";
  if (!input.allowNetwork) {
    throw new Error(
      "Refusing to bind to a non-loopback interface in local mode. " +
        "Re-run with --allow-network to enable multi-user (authenticated) mode.",
    );
  }
  return "multi";
}

/** UI banner descriptor for a resolved auth mode (req 09.1 (b)). */
export interface AuthBanner {
  /** Whether the banner should be shown. */
  shown: boolean;
  /** Banner text (empty when not shown). */
  text: string;
}

/**
 * Return the UI banner for a resolved auth mode. In local mode it states
 * "local mode — no auth"; in multi-user mode it is hidden.
 */
export function bannerForMode(mode: AuthMode): AuthBanner {
  if (mode === "local") {
    return { shown: true, text: "local mode — no auth" };
  }
  return { shown: false, text: "" };
}
