/**
 * Change activity timeline (req 7.3).
 *
 * The timeline renders a chronological feed of audit-log events (change
 * created, artifact edited, task completed, validation run, archive, restore).
 * AC 7.3(a): each event deep-links to the affected entity.
 *
 * `describeActivityEvent` is the pure behavioural core that maps a raw
 * audit-log row into a display descriptor consumed by the timeline component.
 */

export interface ActivityEventInput {
  projectId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string | null;
  author?: string | null;
}

export interface ActivityEventDescriptor {
  /** Original audit action (e.g. `task.completed`). */
  type: string;
  /** Human-readable label. */
  label: string;
  /** Deep link to the affected entity, or null when none is known. */
  href: string | null;
  /** Display actor ("Unattributed" when absent). */
  actor: string;
  /** Original details payload (may be rendered as supporting text). */
  details: string | null;
}

/** A label/title fragment extracted from the details blob, if any. */
function detailTitle(details: string | null | undefined): string | null {
  if (!details) return null;
  const flat = details.replace(/\s+/g, " ").trim();
  return flat.length > 0 ? flat : null;
}

/**
 * Map a raw audit-log event into a deep-linkable timeline descriptor.
 *
 * Routes mirror the App Router structure under `/projects/[id]/...`:
 *   - change  → /projects/:pid/changes/:id
 *   - spec    → /projects/:pid/specs/:id
 *   - task    → /projects/:pid/kanban  (the board owns task cards)
 *   - project → /projects/:pid
 */
export function describeActivityEvent(
  input: ActivityEventInput
): ActivityEventDescriptor {
  const { projectId, action, entityType, entityId } = input;
  const actor = input.author?.trim() || "Unattributed";
  const details = input.details ?? null;
  const subject = detailTitle(details);

  const verb = action.split(".").pop() ?? action;

  const label = (() => {
    switch (action) {
      case "change.created":
        return subject
          ? `Change created — ${subject}`
          : "Change created";
      case "change.archived":
        return "Change archived";
      case "change.restored":
        return "Change restored";
      case "artifact.edited":
        return subject
          ? `Artifact edited — ${subject}`
          : "Artifact edited";
      case "task.completed":
        return subject ? `Task completed — ${subject}` : "Task completed";
      case "validation.run":
        return "Validation run";
      default: {
        const human = verb.replace(/[-_]/g, " ");
        return human.charAt(0).toUpperCase() + human.slice(1);
      }
    }
  })();

  const href = (() => {
    switch (entityType) {
      case "change":
        return `/projects/${projectId}/changes/${entityId}`;
      case "spec":
      case "specDomain":
      case "spec_domain":
        return `/projects/${projectId}/specs/${entityId}`;
      case "task":
        return `/projects/${projectId}/kanban`;
      case "project":
        return `/projects/${projectId}`;
      default:
        return null;
    }
  })();

  return { type: action, label, href, actor, details };
}
