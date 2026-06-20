/**
 * Shared reference-type taxonomy + runtime validation guard (task 2.3).
 *
 * This is the single source of truth for "which entity kinds can produce a
 * reference payload". It is reused by:
 *
 *  - the API route (`src/app/api/reference/[type]/[id]/route.ts`) to decide
 *    the 400-with-taxonomy response for an unknown `type`, and
 *  - the payload builder (`src/lib/entity-reference/build.ts`) to throw a
 *    clean `TypeError` on unsupported input before dispatching per kind.
 *
 * Keeping the taxonomy in its own module means neither consumer owns it, so
 * adding/removing a kind only edits one file. The list is intentionally kept
 * in lock-step with the `EntityType` union in {@link types.ts}.
 */

import type { EntityType } from "@/lib/entity-reference/types";

/**
 * Supported entity-type taxonomy, used for the 400 error body and the runtime
 * guard. Declared `readonly` so consumers cannot mutate the shared list.
 */
export const SUPPORTED_REFERENCE_TYPES: readonly EntityType[] = [
  "project",
  "change",
  "spec",
  "spec-domain",
  "requirement",
  "task",
  "schema",
  "context-store",
  "workspace",
  "initiative",
];

/**
 * Type guard: is `value` one of the supported reference entity types?
 *
 * Narrow, total, and side-effect free — safe to call on untrusted route
 * params or builder inputs. Rejects non-strings and is case- and
 * whitespace-sensitive.
 */
export function isSupportedType(value: unknown): value is EntityType {
  return (
    typeof value === "string" &&
    (SUPPORTED_REFERENCE_TYPES as readonly string[]).includes(value)
  );
}
