import type { Health, PlanStatus } from "@/lib/utils";

/**
 * Real-data contract for the v4-style dashboard.
 * The server (src/app/page.tsx) fetches from the DB and serializes into this
 * shape; the client components below are pure presentations of it — no mocks.
 */

export type FlowKey = "findings" | "requirements" | "intentions" | "plans";

export type FlowItem = {
  title: string;
  detail: string;
  state: string;
};

export type PlanRow = {
  title: string;
  owner: string;
  status: PlanStatus;
  due: string;
};

export type ProjectView = {
  id: string;
  name: string;
  area: string;
  owner: string;
  phase: string;
  updated: string;
  accent: string;
  health: Health;
  progress: number;
  risk: number;
  summary: string;
  /** Counts surfaced as small badges in the project switcher / matrix. */
  activeChanges: number;
  flow: Record<FlowKey, FlowItem[]>;
  plan: PlanRow[];
  /**
   * True for stubbed remote-git enrollments (`enrollmentSource = "remote-git"`,
   * `projected = false`) that are recorded but not yet cloned/projected. The
   * collective dashboard renders these distinctly so the user can tell them
   * apart from fully-projected projects (task 4.5).
   */
  pendingRemote?: boolean;
  /** Set only for pending remote projects (the remote git URL that will be
   * cloned once git integration lands, req 08.4). */
  remoteGitUrl?: string | null;
};

export type ScopedFlowItem = FlowItem & {
  projectName: string;
  accent: string;
};

export type ScopedPlanRow = PlanRow & {
  projectName: string;
  accent: string;
};

export const flowColumns: Array<{ key: FlowKey; label: string; description: string }> = [
  {
    key: "findings",
    label: "Findings",
    description: "Spec domains registered for this project — the surfaces it covers.",
  },
  {
    key: "requirements",
    label: "Requirements",
    description: "Committed behavior pulled from the project's spec requirements.",
  },
  {
    key: "intentions",
    label: "Intentions",
    description: "Proposed changes not yet in implementation.",
  },
  {
    key: "plans",
    label: "Plans",
    description: "OpenSpec changes currently in implementation.",
  },
];
