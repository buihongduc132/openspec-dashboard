"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * EnrollmentForm — collective-dashboard enrollment entry point.
 *
 * The Local tab drives the local-enrollment flow:
 *   1. The user types/pastes an absolute local path and clicks "Validate".
 *   2. The path is dispatched to `POST /api/enrollment/local` (task 3.3) for
 *      allow-list + OpenSpec detection.
 *   3. On success, an "Enroll" button appears; clicking it registers the
 *      project (`enrollmentSource = "local"`, `projected = true`, task 3.5)
 *      via `POST /api/projects` and redirects to that project's view.
 *
 * The `openspec init` offer for non-OpenSpec directories (task 3.4) and the
 * remote-git CLI detection + pending enrollment (tasks 4.2–4.4) are added in
 * their own tasks. The "Remote git" tab (task 4.1) is included here and
 * exposes a GitHub / GitLab URL input; its detection logic lands later.
 */

export type LocalValidation =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; openSpecProject: boolean; path: string }
  | { status: "error"; message: string };

export type EnrollState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

/** State machine for the Remote-git tab submission (tasks 4.3 / 4.4). */
export type RemoteEnrollState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string };

export function EnrollmentForm() {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [validation, setValidation] = useState<LocalValidation>({
    status: "idle",
  });
  const [enroll, setEnroll] = useState<EnrollState>({ status: "idle" });
  const [remote, setRemote] = useState<RemoteEnrollState>({ status: "idle" });

  async function handleValidate() {
    setValidation({ status: "loading" });
    setEnroll({ status: "idle" });
    try {
      const res = await fetch("/api/enrollment/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data: Record<string, unknown> = await res
        .json()
        .catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        setValidation({
          status: "error",
          message:
            (data && (data.error || data.message)) ||
            "Validation failed. Check the path and try again.",
        });
        return;
      }
      setValidation({
        status: "ok",
        // The server reports OpenSpec detection as `isOpenSpec`.
        openSpecProject: Boolean(data.isOpenSpec),
        path: data.path ?? path,
      });
    } catch (err) {
      setValidation({
        status: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  }

  /**
   * Submit the remote-git URL to `/api/enrollment/remote` (tasks 4.3 / 4.4).
   *
   * - 201: the pending remote project was recorded → show the explicit
   *   "planned" message and redirect into the project view.
   * - 409: no matching authenticated CLI (missing / failed) → surface the
   *   server's detection message, which names the required CLI. Do NOT clone,
   *   do NOT enroll, do NOT redirect (task 4.4).
   */
  async function handleRemoteEnroll() {
    const trimmed = remoteUrl.trim();
    if (!trimmed) return;
    setRemote({ status: "submitting" });
    try {
      const res = await fetch("/api/enrollment/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteUrl: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRemote({
          status: "error",
          message:
            (data && (data.error || data.message)) ||
            "Remote enrollment failed. Check the URL and try again.",
        });
        return;
      }
      setRemote({
        status: "ok",
        message:
          (data && data.message) ||
          "Enrolled as a pending remote project.",
      });
      router.push(`/projects/${data.project?.id}`);
    } catch (err) {
      setRemote({
        status: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  }

  async function handleEnroll() {
    if (validation.status !== "ok") return;
    const validatedPath = validation.path;
    const name = deriveProjectName(validatedPath);

    setEnroll({ status: "submitting" });
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          rootPath: validatedPath,
          enrollmentSource: "local",
          projected: true,
        }),
      });
      const data: Record<string, unknown> = await res
        .json()
        .catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        setEnroll({
          status: "error",
          message:
            (data && (data.error || data.message)) ||
            "Enrollment failed. Please try again.",
        });
        return;
      }
      // Redirect to the newly-enrolled project's view.
      router.push(`/projects/${data.id}`);
    } catch (err) {
      setEnroll({
        status: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  }

  const enrollDisabled = enroll.status === "submitting";
  const remoteDisabled =
    remote.status === "submitting" || remoteUrl.trim() === "";

  return (
    <Tabs defaultValue="local" className="w-full max-w-2xl">
      <TabsList aria-label="Enrollment source">
        <TabsTrigger value="local">Local</TabsTrigger>
        <TabsTrigger value="remote-git">Remote git</TabsTrigger>
      </TabsList>

      <TabsContent value="local">
        <div className="space-y-4 rounded-lg border border-slate-200 p-6">
          <div>
            <label
              htmlFor="enrollment-local-path"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Local project path
            </label>
            <Input
              id="enrollment-local-path"
              name="path"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="/repos/my-project"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              aria-label="Path"
            />
            <p className="mt-1 text-xs text-slate-500">
              Absolute path to a local directory. Must be inside an allowed
              enrollment root.
            </p>
          </div>

          <Button
            type="button"
            onClick={handleValidate}
            disabled={validation.status === "loading" || path.trim() === ""}
          >
            {validation.status === "loading" ? "Validating…" : "Validate"}
          </Button>

          <ValidationFeedback validation={validation} />

          {validation.status === "ok" && (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <Button
                type="button"
                onClick={handleEnroll}
                disabled={enrollDisabled}
              >
                {enroll.status === "submitting"
                  ? "Enrolling…"
                  : "Enroll project"}
              </Button>
              <EnrollFeedback enroll={enroll} />
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="remote-git">
        <div className="space-y-4 rounded-lg border border-slate-200 p-6">
          <div>
            <label
              htmlFor="enrollment-remote-url"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Repository URL
            </label>
            <Input
              id="enrollment-remote-url"
              name="remoteUrl"
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://github.com/org/repo or https://gitlab.com/org/repo"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              aria-label="URL"
            />
            <p className="mt-1 text-xs text-slate-500">
              Paste a GitHub or GitLab repository URL. The dashboard will detect
              the matching authenticated CLI (<code>gh</code> /{" "}
              <code>glab</code>) and record the project as a pending remote
              enrollment (planned — full clone lands with git integration).
            </p>
          </div>

          <Button
            type="button"
            onClick={handleRemoteEnroll}
            disabled={remoteDisabled}
          >
            {remote.status === "submitting" ? "Checking…" : "Enroll"}
          </Button>

          <RemoteFeedback remote={remote} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

/**
 * Derive a human-friendly project name from an absolute path (its basename),
 * falling back to the full path when the basename is empty.
 */
function deriveProjectName(p: string): string {
  const trimmed = (p ?? "").replace(/[\\/]+$/, "");
  const base = trimmed.split(/[\\/]/).filter(Boolean).pop();
  return base && base.length > 0 ? base : trimmed;
}

function ValidationFeedback({ validation }: { validation: LocalValidation }) {
  if (validation.status === "error") {
    return (
      <p role="alert" className="text-sm text-red-600">
        {validation.message}
      </p>
    );
  }
  if (validation.status === "ok") {
    return (
      <p className="text-sm text-emerald-600">
        {validation.openSpecProject
          ? "OpenSpec project detected — ready to enroll."
          : "Not an OpenSpec project. You can offer to run `openspec init`."}
      </p>
    );
  }
  return null;
}

function EnrollFeedback({ enroll }: { enroll: EnrollState }) {
  if (enroll.status === "error") {
    return (
      <p role="alert" className="text-sm text-red-600">
        {enroll.message}
      </p>
    );
  }
  return null;
}

function RemoteFeedback({ remote }: { remote: RemoteEnrollState }) {
  if (remote.status === "error") {
    return (
      <p role="alert" className="text-sm text-red-600">
        {remote.message}
      </p>
    );
  }
  if (remote.status === "ok") {
    return (
      <p className="text-sm text-emerald-600">
        {remote.message}
      </p>
    );
  }
  return null;
}
