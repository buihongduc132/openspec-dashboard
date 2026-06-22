/**
 * Task 1.8 — Filesystem projection.
 *
 * Projects the Task 1.7 in-memory model back to the upstream OpenSpec file
 * tree using atomic writes (write-to-temp + rename). Every emitted file is
 * written through {@link writeFileAtomic}, so a projection either fully
 * materialises a file or leaves its previous content untouched — there is no
 * window during which a reader observes a half-written file.
 *
 * Spec source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "Filesystem projection with
 * atomic writes"; req 01 §1.4, INV-7).
 *
 * NOTE: Per-section ETags and the 409 + merge-UI conflict policy are Task 1.9
 * (INV-7 section granularity) and are layered on top of this primitive.
 */
import { join } from "node:path";
import type { ChangeModel, ProjectModel } from "@/lib/openspec-parser";
import { writeFileAtomic, type ProjectionFs, nodeFs } from "./atomic-write";
import {
  serializeMainSpec,
  serializeDeltaSpec,
  serializeTasks,
} from "./serialize";

/**
 * Project a single change model back to `<dir>/...` using atomic writes.
 * Emits proposal/design artifacts, tasks, and any delta specs.
 */
export async function projectChange(
  dir: string,
  change: ChangeModel,
  fs: ProjectionFs = nodeFs,
): Promise<void> {
  if (change.artifacts.proposal !== undefined) {
    await writeFileAtomic(join(dir, "proposal.md"), change.artifacts.proposal, fs);
  }
  if (change.artifacts.design !== undefined) {
    await writeFileAtomic(join(dir, "design.md"), change.artifacts.design, fs);
  }
  for (const [name, content] of Object.entries(change.artifacts.other)) {
    await writeFileAtomic(join(dir, name), content, fs);
  }

  await writeFileAtomic(join(dir, "tasks.md"), serializeTasks(change.tasks.items), fs);

  for (const [domain, delta] of Object.entries(change.deltaSpecs)) {
    const deltaPath = join(dir, "specs", domain, "spec.md");
    await writeFileAtomic(deltaPath, serializeDeltaSpec(delta.plan), fs);
  }
}

/**
 * Project a full project model back to `<dir>/...` using atomic writes:
 * main specs under `specs/<cap>/spec.md` and each change in its own directory.
 */
export async function projectProject(
  dir: string,
  project: ProjectModel,
  fs: ProjectionFs = nodeFs,
): Promise<void> {
  for (const spec of project.specs) {
    const specPath = join(dir, "specs", spec.capability, "spec.md");
    await writeFileAtomic(
      specPath,
      serializeMainSpec({
        capability: spec.capability,
        requirements: spec.requirements,
      }),
      fs,
    );
  }

  for (const change of project.changes) {
    await projectChange(join(dir, "changes", change.name), change, fs);
  }
}
