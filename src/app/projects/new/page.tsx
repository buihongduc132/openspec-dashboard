import { EnrollmentForm } from "@/components/enrollment-form";

/**
 * `/projects/new` is the collective-dashboard **enrollment entry point**
 * (task 3.6).
 *
 * Historically this page was a plain manual-registration form. As part of the
 * multi-project collective dashboard, it is now the on-ramp that gets a
 * project into the dashboard's registry. It renders the tabbed
 * `EnrollmentForm`:
 *   - **Local** — select/validate a local directory and enroll it (tasks 3.x).
 *   - **Remote git** — reserved for the GitHub/GitLab enrollment path
 *     (tasks 4.x; stubbed in this change).
 *
 * The page keeps a clearly-scoped heading so it is never mistaken for a single
 * project's view.
 */
export default function NewProjectPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Enroll project</h1>
        <p className="mt-1 text-slate-500">
          Add a project to your collective dashboard — local or remote.
        </p>
      </div>

      <EnrollmentForm />
    </div>
  );
}
