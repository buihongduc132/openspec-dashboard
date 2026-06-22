/**
 * Initiative status transitions (task 5.4, req 01.8b).
 *
 * Lifecycle: proposed → active → completed → abandoned.
 *
 * `abandoned` is reachable only from `active`: a fresh proposal cannot be
 * abandoned without first being activated, and a completed initiative can
 * only be abandoned by first reactivating it. This mirrors req 01.8b's
 * documented state machine (proposed → active → completed → abandoned).
 */

export const INITIATIVE_STATUSES = [
  "proposed",
  "active",
  "completed",
  "abandoned",
] as const;

export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

/** Allowed forward transitions from each status. */
const ALLOWED_TRANSITIONS: Record<InitiativeStatus, InitiativeStatus[]> = {
  proposed: ["active"],
  active: ["completed", "abandoned", "proposed"],
  completed: ["active"],
  abandoned: ["active"],
};

/** Is `next` a valid status value string? */
export function isValidStatus(next: string): next is InitiativeStatus {
  return (INITIATIVE_STATUSES as readonly string[]).includes(next);
}

/**
 * Is transitioning from `current` to `next` permitted by the state machine?
 * Same-status (no-op) is always allowed.
 */
export function canTransition(current: string, next: InitiativeStatus): boolean {
  if (current === next) return true;
  if (!isValidStatus(current)) return false;
  return ALLOWED_TRANSITIONS[current].includes(next);
}
