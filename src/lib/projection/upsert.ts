/**
 * Task 4.4 (cycle 3) — projection upsert layer.
 *
 * Consumes the {@link ParsedFile} stream produced by the parse-runner (task 4.3)
 * and reconciles it into the existing dashboard tables, grouped into
 * projection "kinds" that are each other's transaction-isolation boundary
 * (design D6):
 *
 *   - a SPEC kind = one capability (`<rootPath>/openspec/specs/<cap>/spec.md`)
 *     → spec_domains + specs + requirements + scenarios, isolated per
 *       capability so a concurrent read of `billing` never sees `auth`
 *       mid-upsert.
 *   - a CHANGE kind = one change directory (`changes/<name>/`, incl. archived)
 *     → changes + delta_specs + tasks, isolated per change.
 *
 * Incremental skip (design D2): every row stores a SHA-256 of its own
 * canonical source text in `contentHash`. On re-projection the existing rows
 * (with hashes) are read FIRST, outside any transaction; if every desired row
 * already exists with an identical hash, the kind is skipped entirely — no
 * transaction is opened, no INSERT/UPDATE/DELETE is issued. Only changed /
 * new / missing rows are written, and all writes for one kind occur inside a
 * single drizzle transaction.
 *
 * Delete-missing: capabilities / changes present in the DB but absent from the
 * parsed stream are removed (each in its own transaction), so the DB reflects
 * on-disk deletions.
 */
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import {
  specDomains,
  specs,
  requirements,
  scenarios,
  changes,
  deltaSpecs,
  tasks,
} from "@/db/schema";
import type {
  ParsedFile,
  ParsedSpecFile,
  ParsedDeltaFile,
  ParsedTasksFile,
} from "@/lib/projection/parse-runner";
import { contentHash } from "@/lib/projection/hash";

export type ProjectionDb = NodePgDatabase<typeof schema>;

export interface UpsertStats {
  /** Source files whose every row already matched (no writes issued). */
  skipped: string[];
  /** Source files that produced at least one insert/update. */
  upserted: string[];
}

// ─── Kind grouping ───────────────────────────────────────────────────────────

interface SpecKind {
  capability: string;
  file: ParsedSpecFile;
}

interface ChangeKind {
  changeName: string;
  archived: boolean;
  deltas: ParsedDeltaFile[];
  tasksFile: ParsedTasksFile | null;
}

function groupKinds(files: ParsedFile[]): {
  specKinds: SpecKind[];
  changeKinds: ChangeKind[];
} {
  const specKinds: SpecKind[] = [];
  const changeMap = new Map<string, ChangeKind>();

  for (const f of files) {
    if (f.kind === "spec") {
      specKinds.push({ capability: f.model.capability, file: f });
    } else if (f.kind === "delta") {
      let k = changeMap.get(f.changeName);
      if (!k) {
        k = {
          changeName: f.changeName,
          archived: f.archived,
          deltas: [],
          tasksFile: null,
        };
        changeMap.set(f.changeName, k);
      }
      k.deltas.push(f);
      if (f.archived) k.archived = true;
    } else if (f.kind === "tasks") {
      let k = changeMap.get(f.changeName);
      if (!k) {
        k = {
          changeName: f.changeName,
          archived: f.archived,
          deltas: [],
          tasksFile: null,
        };
        changeMap.set(f.changeName, k);
      }
      k.tasksFile = f;
      if (f.archived) k.archived = true;
    }
  }

  return { specKinds, changeKinds: [...changeMap.values()] };
}

// ─── Row hash helpers (per-row canonical source) ────────────────────────────

function hashRequirement(name: string, body: string, orderIndex: number): string {
  return contentHash(`${orderIndex}\u0000${name}\u0000${body}`);
}

function hashScenario(
  name: string,
  given: string,
  whenText: string,
  thenText: string,
  orderIndex: number,
): string {
  return contentHash(`${orderIndex}\u0000${name}\u0000${given}\u0000${whenText}\u0000${thenText}`);
}

function hashTask(title: string, checked: boolean, orderIndex: number): string {
  return contentHash(`${orderIndex}\u0000${checked}\u0000${title}`);
}

function hashChangeRow(name: string, status: string): string {
  return contentHash(`${name}\u0000${status}`);
}

function hashDeltaRow(domain: string, deltaType: string, body: string): string {
  return contentHash(`${domain}\u0000${deltaType}\u0000${body}`);
}

/** Split a scenario body into GIVEN/WHEN/THEN clauses; unknown lines → GIVEN. */
function splitScenario(body: string): { given: string; when: string; then: string } {
  const lines = body.split("\n");
  let given = "";
  let whenText = "";
  let thenText = "";
  let bucket: "given" | "when" | "then" = "given";
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^-\s*(GIVEN|WHEN|THEN)\b\s*(.*)$/i);
    if (m) {
      const key = m[1].toUpperCase();
      bucket = key === "GIVEN" ? "given" : key === "WHEN" ? "when" : "then";
      const rest = m[2].trim();
      if (bucket === "given") given = rest;
      else if (bucket === "when") whenText = rest;
      else thenText = rest;
    } else if (line) {
      if (bucket === "given") given = given ? `${given} ${line}` : line;
      else if (bucket === "when") whenText = whenText ? `${whenText} ${line}` : line;
      else thenText = thenText ? `${thenText} ${line}` : line;
    }
  }
  // Default: if only free text was present, treat the whole body as `given`.
  if (!given && !whenText && !thenText) given = body.trim();
  return { given, when: whenText, then: thenText };
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Reconcile a parsed file stream into the DB for one project. Idempotent and
 * incremental: unchanged rows are skipped, changed rows updated, missing rows
 * deleted — each kind in its own transaction.
 */
export async function upsertProjectContent(
  db: ProjectionDb,
  projectId: string,
  parsedFiles: ParsedFile[],
): Promise<UpsertStats> {
  const stats: UpsertStats = { skipped: [], upserted: [] };
  const { specKinds, changeKinds } = groupKinds(parsedFiles);

  // 1. SPEC kinds (process first so their domains exist before deltas reference them).
  for (const kind of specKinds) {
    const r = await reconcileSpecKind(db, projectId, kind);
    if (r.changed) stats.upserted.push(kind.file.filePath);
    else stats.skipped.push(kind.file.filePath);
  }
  await reconcileSpecDeletions(db, projectId, specKinds.map((k) => k.capability));

  // 2. CHANGE kinds.
  for (const kind of changeKinds) {
    const r = await reconcileChangeKind(db, projectId, kind);
    for (const fp of r.touchedFiles) stats.upserted.push(fp);
    for (const fp of r.untouchedFiles) stats.skipped.push(fp);
  }
  await reconcileChangeDeletions(db, projectId, changeKinds.map((k) => k.changeName));

  return stats;
}

// ─── Spec kind reconciliation ────────────────────────────────────────────────

interface ReconcileResult {
  changed: boolean;
}

/**
 * Reconcile one capability's spec tree. Reads existing rows first (no tx); only
 * opens a transaction if something actually changed.
 */
async function reconcileSpecKind(
  db: ProjectionDb,
  projectId: string,
  kind: SpecKind,
): Promise<ReconcileResult> {
  const { capability, file } = kind;
  const now = new Date();

  // --- read existing state ---
  const [domain] = await db
    .select()
    .from(specDomains)
    .where(and(eq(specDomains.projectId, projectId), eq(specDomains.name, capability)))
    .limit(1);

  let domainId: string | undefined = domain?.id;
  let specRow: typeof specs.$inferSelect | undefined;
  if (domainId) {
    [specRow] = await db
      .select()
      .from(specs)
      .where(eq(specs.domainId, domainId))
      .limit(1);
  }
  const existingReqs = specRow
    ? await db.select().from(requirements).where(eq(requirements.specId, specRow.id))
    : [];
  const reqIds = existingReqs.map((r) => r.id);
  const existingScenarios =
    reqIds.length > 0
      ? await db
          .select()
          .from(scenarios)
          .where(inArray(scenarios.requirementId, reqIds))
      : [];

  // --- build desired state ---
  const specHash = file.hash; // file-level hash for the specs row
  const desiredReqs = file.model.requirements.map((r, i) => ({
    title: r.name,
    body: r.body,
    strength: "SHALL" as string,
    orderIndex: i,
    contentHash: hashRequirement(r.name, r.body, i),
    scenarios: r.scenarios.map((s, j) => {
      const parts = splitScenario(s.body);
      return {
        title: s.name,
        given: parts.given,
        when: parts.when,
        then: parts.then,
        orderIndex: j,
        contentHash: hashScenario(s.name, parts.given, parts.when, parts.then, j),
      };
    }),
  }));

  // --- diff: are any writes needed? ---
  const needsDomain = !domainId;
  const needsSpec =
    !specRow || specRow.contentHash !== specHash || specRow.content !== file.content;

  const reqByKey = new Map(existingReqs.map((r) => [r.title, r]));
  const scenByKey = new Map(
    existingScenarios.map((s) => [`${s.requirementId}::${s.title}`, s]),
  );

  let needsReqWrite = false;
  for (const dr of desiredReqs) {
    const ex = reqByKey.get(dr.title);
    if (!ex || ex.contentHash !== dr.contentHash || ex.body !== dr.body) {
      needsReqWrite = true;
      break;
    }
    for (const ds of dr.scenarios) {
      const exS = scenByKey.get(`${ex!.id}::${ds.title}`);
      if (!exS || exS.contentHash !== ds.contentHash) {
        needsReqWrite = true;
        break;
      }
    }
    if (needsReqWrite) break;
  }
  // deletions of requirements/scenarios no longer present
  const desiredReqTitles = new Set(desiredReqs.map((r) => r.title));
  const reqDeleted = existingReqs.some((r) => !desiredReqTitles.has(r.title));
  const desiredScenKeys = new Set(
    desiredReqs.flatMap((r) => r.scenarios.map((s) => `${r.title}::${s.title}`)),
  );
  const scenDeleted = existingScenarios.some(
    (s) =>
      desiredReqTitles.has(existingReqs.find((r) => r.id === s.requirementId)!.title) &&
      !desiredScenKeys.has(
        `${existingReqs.find((r) => r.id === s.requirementId)!.title}::${s.title}`,
      ),
  );

  if (!needsDomain && !needsSpec && !needsReqWrite && !reqDeleted && !scenDeleted) {
    return { changed: false };
  }

  // --- apply inside one transaction ---
  await db.transaction(async (tx) => {
    if (!domainId) {
      const [created] = await tx
        .insert(specDomains)
        .values({ projectId, name: capability })
        .returning();
      domainId = created.id;
    }

    if (!specRow) {
      await tx.insert(specs).values({
        domainId,
        content: file.content,
        contentHash: specHash,
      });
    } else if (needsSpec) {
      await tx
        .update(specs)
        .set({ content: file.content, contentHash: specHash, updatedAt: now })
        .where(eq(specs.id, specRow.id));
    }
    const specId = specRow?.id ?? (await currentSpecId(tx, domainId!));

    // requirements + scenarios: reconcile per (title).
    for (const dr of desiredReqs) {
      const ex = reqByKey.get(dr.title);
      let reqId: string;
      if (!ex) {
        const [ins] = await tx
          .insert(requirements)
          .values({
            specId,
            title: dr.title,
            body: dr.body,
            strength: dr.strength,
            orderIndex: dr.orderIndex,
            contentHash: dr.contentHash,
          })
          .returning();
        reqId = ins.id;
      } else {
        reqId = ex.id;
        if (ex.contentHash !== dr.contentHash || ex.body !== dr.body) {
          await tx
            .update(requirements)
            .set({
              body: dr.body,
              strength: dr.strength,
              orderIndex: dr.orderIndex,
              contentHash: dr.contentHash,
              updatedAt: now,
            })
            .where(eq(requirements.id, ex.id));
        }
      }

      for (const ds of dr.scenarios) {
        const exS = scenByKey.get(`${reqId}::${ds.title}`);
        if (!exS) {
          await tx.insert(scenarios).values({
            requirementId: reqId,
            title: ds.title,
            given: ds.given,
            when: ds.when,
            then: ds.then,
            orderIndex: ds.orderIndex,
            contentHash: ds.contentHash,
          });
        } else if (exS.contentHash !== ds.contentHash) {
          await tx
            .update(scenarios)
            .set({
              given: ds.given,
              when: ds.when,
              then: ds.then,
              orderIndex: ds.orderIndex,
              contentHash: ds.contentHash,
              updatedAt: now,
            })
            .where(eq(scenarios.id, exS.id));
        }
      }
    }

    // delete requirement rows (and cascade scenarios) no longer present.
    const staleReqIds = existingReqs
      .filter((r) => !desiredReqTitles.has(r.title))
      .map((r) => r.id);
    if (staleReqIds.length) {
      await tx.delete(requirements).where(inArray(requirements.id, staleReqIds));
    }
    // delete orphaned scenarios (title removed under a kept requirement).
    const keptReqIds = existingReqs
      .filter((r) => desiredReqTitles.has(r.title))
      .map((r) => r.id);
    if (keptReqIds.length) {
      const keptDesired = new Map(
        desiredReqs.map((dr) => [dr.title, dr.scenarios.map((s) => s.title)]),
      );
      for (const r of existingReqs.filter((r) => desiredReqTitles.has(r.title))) {
        const desiredTitles = new Set(keptDesired.get(r.title)!);
        const staleScen = existingScenarios.filter(
          (s) => s.requirementId === r.id && !desiredTitles.has(s.title),
        );
        if (staleScen.length) {
          await tx
            .delete(scenarios)
            .where(inArray(scenarios.id, staleScen.map((s) => s.id)));
        }
      }
    }
  });

  return { changed: true };
}

/** Fetch the specs row id for a freshly-inserted domain within a tx. */
async function currentSpecId(
  tx: Parameters<Parameters<ProjectionDb["transaction"]>[0]>[0],
  domainId: string,
): Promise<string> {
  const [row] = await tx.select().from(specs).where(eq(specs.domainId, domainId)).limit(1);
  return row!.id;
}

/**
 * Delete spec-side rows for capabilities present in the DB but absent from this
 * run's parsed stream (capability directory removed). Each removed capability
 * is its own transaction. A domain referenced by delta_specs is preserved (its
 * specs/requirements/scenarios are still cleared).
 */
async function reconcileSpecDeletions(
  db: ProjectionDb,
  projectId: string,
  presentCapabilities: string[],
): Promise<void> {
  const all = await db
    .select()
    .from(specDomains)
    .where(eq(specDomains.projectId, projectId));
  const present = new Set(presentCapabilities);
  const missing = all.filter((d) => !present.has(d.name));

  for (const d of missing) {
    // Does any delta_spec reference this domain? If so, keep the domain row but
    // clear its specs/requirements/scenarios.
    const [ref] = await db
      .select({ id: deltaSpecs.id })
      .from(deltaSpecs)
      .where(eq(deltaSpecs.domainId, d.id))
      .limit(1);
    await db.transaction(async (tx) => {
      const specRows = await tx.select().from(specs).where(eq(specs.domainId, d.id));
      for (const s of specRows) {
        const reqRows = await tx
          .select({ id: requirements.id })
          .from(requirements)
          .where(eq(requirements.specId, s.id));
        if (reqRows.length) {
          await tx
            .delete(scenarios)
            .where(
              inArray(
                scenarios.requirementId,
                reqRows.map((r) => r.id),
              ),
            );
        }
        await tx.delete(requirements).where(eq(requirements.specId, s.id));
      }
      await tx.delete(specs).where(eq(specs.domainId, d.id));
      if (!ref) {
        await tx.delete(specDomains).where(eq(specDomains.id, d.id));
      }
    });
  }
}

// ─── Change kind reconciliation ──────────────────────────────────────────────

interface ChangeReconcileResult {
  touchedFiles: string[];
  untouchedFiles: string[];
}

async function reconcileChangeKind(
  db: ProjectionDb,
  projectId: string,
  kind: ChangeKind,
): Promise<ChangeReconcileResult> {
  const now = new Date();
  const { changeName, archived } = kind;
  const status = archived ? "archived" : "proposed";

  // existing change row
  const [changeRow] = await db
    .select()
    .from(changes)
    .where(and(eq(changes.projectId, projectId), eq(changes.name, changeName)))
    .limit(1);
  const changeId: string | undefined = changeRow?.id;

  // existing deltas for this change
  const existingDeltas = changeId
    ? await db.select().from(deltaSpecs).where(eq(deltaSpecs.changeId, changeId))
    : [];
  // resolve domainId → name so delta rows can be keyed by domain name.
  const domainIds = [...new Set(existingDeltas.map((d) => d.domainId))];
  const domainRows = domainIds.length
    ? await db
        .select({ id: specDomains.id, name: specDomains.name })
        .from(specDomains)
        .where(inArray(specDomains.id, domainIds))
    : [];
  const domainNameById = new Map(domainRows.map((d) => [d.id, d.name]));
  const deltaDomainName = (d: (typeof existingDeltas)[number]): string =>
    domainNameById.get(d.domainId) ?? "";
  // existing tasks
  const existingTasks = changeId
    ? await db.select().from(tasks).where(eq(tasks.changeId, changeId))
    : [];

  // desired deltas: each parsed delta file → one row per verb bucket present.
  interface DesiredDelta {
    domain: string;
    deltaType: string;
    content: string;
    contentHash: string;
    filePath: string;
  }
  const desiredDeltas: DesiredDelta[] = [];
  for (const d of kind.deltas) {
    const verbs: string[] = [];
    if (d.plan.sectionPresence.added) verbs.push("added");
    if (d.plan.sectionPresence.modified) verbs.push("modified");
    if (d.plan.sectionPresence.removed) verbs.push("removed");
    if (d.plan.sectionPresence.renamed) verbs.push("renamed");
    if (verbs.length === 0) verbs.push("added");
    for (const v of verbs) {
      desiredDeltas.push({
        domain: d.domain,
        deltaType: v,
        content: d.content,
        contentHash: hashDeltaRow(d.domain, v, d.content),
        filePath: d.filePath,
      });
    }
  }

  // desired tasks
  const desiredTasks = kind.tasksFile
    ? kind.tasksFile.items.map((t, i) => ({
        title: t.label,
        checked: t.checked,
        orderIndex: i,
        taskNumber: String(t.line),
        contentHash: hashTask(t.label, t.checked, i),
        filePath: kind.tasksFile!.filePath,
      }))
    : [];

  // --- diff ---
  const needsChange =
    !changeId || changeRow!.status !== status || changeRow!.contentHash !== hashChangeRow(changeName, status);

  const desiredDeltaKeys = new Set(desiredDeltas.map((d) => `${d.domain}::${d.deltaType}`));
  const existingDeltaMap = new Map(
    existingDeltas.map((d) => [`${deltaDomainName(d)}::${d.deltaType}`, d]),
  );
  let needsDeltaWrite = false;
  for (const dd of desiredDeltas) {
    const ex = existingDeltaMap.get(`${dd.domain}::${dd.deltaType}`);
    if (!ex || ex.contentHash !== dd.contentHash || ex.content !== dd.content) {
      needsDeltaWrite = true;
      break;
    }
  }
  const deltaDeleted = existingDeltas.some(
    (d) => !desiredDeltaKeys.has(`${deltaDomainName(d)}::${d.deltaType}`),
  );

  const desiredTaskKeys = new Set(desiredTasks.map((t) => `${t.taskNumber}::${t.title}`));
  const existingTaskMap = new Map(
    existingTasks.map((t) => [`${t.taskNumber}::${t.title}`, t]),
  );
  let needsTaskWrite = false;
  for (const dt of desiredTasks) {
    const ex = existingTaskMap.get(`${dt.taskNumber}::${dt.title}`);
    if (!ex || ex.contentHash !== dt.contentHash || ex.checked !== dt.checked) {
      needsTaskWrite = true;
      break;
    }
  }
  const taskDeleted = existingTasks.some(
    (t) => !desiredTaskKeys.has(`${t.taskNumber}::${t.title}`),
  );

  // Determine per-file touched/untouched for stats.
  const touchedFiles = new Set<string>();
  const untouchedFiles = new Set<string>();
  const deltaFiles = new Map<string, boolean>(); // filePath → changed?
  for (const dd of desiredDeltas) {
    const ex = existingDeltaMap.get(`${dd.domain}::${dd.deltaType}`);
    const changed = !ex || ex.contentHash !== dd.contentHash;
    deltaFiles.set(dd.filePath, (deltaFiles.get(dd.filePath) ?? false) || changed);
  }
  // deltas removed → their file "changed"
  for (const ex of existingDeltas) {
    if (!desiredDeltaKeys.has(`${deltaDomainName(ex)}::${ex.deltaType}`)) {
      // removed; can't map back to a file precisely — mark all delta files touched.
      for (const k of deltaFiles.keys()) deltaFiles.set(k, true);
    }
  }

  const tasksChanged = needsTaskWrite || taskDeleted;

  for (const [fp, changed] of deltaFiles) {
    if (changed) touchedFiles.add(fp);
    else untouchedFiles.add(fp);
  }
  if (kind.tasksFile) {
    if (tasksChanged) touchedFiles.add(kind.tasksFile.filePath);
    else untouchedFiles.add(kind.tasksFile.filePath);
  }

  if (!needsChange && !needsDeltaWrite && !deltaDeleted && !needsTaskWrite && !taskDeleted) {
    return { touchedFiles: [], untouchedFiles: [...touchedFiles, ...untouchedFiles] };
  }

  // --- apply ---
  await db.transaction(async (tx) => {
    let cid: string;
    if (!changeId) {
      const [created] = await tx
        .insert(changes)
        .values({
          projectId,
          name: changeName,
          status,
          contentHash: hashChangeRow(changeName, status),
        })
        .returning();
      cid = created.id;
    } else {
      cid = changeId;
      if (needsChange) {
        await tx
          .update(changes)
          .set({ status, contentHash: hashChangeRow(changeName, status), updatedAt: now })
          .where(eq(changes.id, changeId));
      }
    }

    // deltas
    for (const dd of desiredDeltas) {
      const domain = await ensureDomain(tx, projectId, dd.domain);
      const ex = existingDeltaMap.get(`${dd.domain}::${dd.deltaType}`);
      if (!ex) {
        await tx.insert(deltaSpecs).values({
          changeId: cid,
          domainId: domain.id,
          deltaType: dd.deltaType,
          content: dd.content,
          contentHash: dd.contentHash,
        });
      } else if (ex.contentHash !== dd.contentHash || ex.content !== dd.content) {
        await tx
          .update(deltaSpecs)
          .set({ content: dd.content, contentHash: dd.contentHash, updatedAt: now })
          .where(eq(deltaSpecs.id, ex.id));
      }
    }
    const staleDeltaIds = existingDeltas
      .filter((d) => !desiredDeltaKeys.has(`${deltaDomainName(d)}::${d.deltaType}`))
      .map((d) => d.id);
    if (staleDeltaIds.length) {
      await tx.delete(deltaSpecs).where(inArray(deltaSpecs.id, staleDeltaIds));
    }

    // tasks
    for (const dt of desiredTasks) {
      const ex = existingTaskMap.get(`${dt.taskNumber}::${dt.title}`);
      if (!ex) {
        await tx.insert(tasks).values({
          changeId: cid,
          projectId,
          taskNumber: dt.taskNumber,
          groupTitle: "General",
          title: dt.title,
          checked: dt.checked,
          orderIndex: dt.orderIndex,
          status: "backlog",
          contentHash: dt.contentHash,
        });
      } else if (ex.contentHash !== dt.contentHash || ex.checked !== dt.checked) {
        await tx
          .update(tasks)
          .set({
            checked: dt.checked,
            orderIndex: dt.orderIndex,
            title: dt.title,
            contentHash: dt.contentHash,
            updatedAt: now,
          })
          .where(eq(tasks.id, ex.id));
      }
    }
    const staleTaskIds = existingTasks
      .filter((t) => !desiredTaskKeys.has(`${t.taskNumber}::${t.title}`))
      .map((t) => t.id);
    if (staleTaskIds.length) {
      await tx.delete(tasks).where(inArray(tasks.id, staleTaskIds));
    }
  });

  return { touchedFiles: [...touchedFiles], untouchedFiles: [...untouchedFiles] };
}

async function ensureDomain(
  tx: Parameters<Parameters<ProjectionDb["transaction"]>[0]>[0],
  projectId: string,
  name: string,
): Promise<{ id: string }> {
  const [existing] = await tx
    .select({ id: specDomains.id })
    .from(specDomains)
    .where(and(eq(specDomains.projectId, projectId), eq(specDomains.name, name)))
    .limit(1);
  if (existing) return existing;
  const [created] = await tx
    .insert(specDomains)
    .values({ projectId, name })
    .returning({ id: specDomains.id });
  return created;
}

/**
 * Delete change rows (cascade wipes delta_specs, tasks, artifacts) for changes
 * present in the DB but absent from this run's parsed stream.
 */
async function reconcileChangeDeletions(
  db: ProjectionDb,
  projectId: string,
  presentChanges: string[],
): Promise<void> {
  const all = await db.select().from(changes).where(eq(changes.projectId, projectId));
  const present = new Set(presentChanges);
  const missing = all.filter((c) => !present.has(c.name));
  if (!missing.length) return;
  // One transaction for the whole change-deletion pass (these are removals of
  // entire change directories; cascade handles children).
  await db.transaction(async (tx) => {
    await tx
      .delete(changes)
      .where(
        and(
          eq(changes.projectId, projectId),
          inArray(
            changes.id,
            missing.map((c) => c.id),
          ),
        ),
      );
  });
}

// Re-exported so callers (task 4.5) can reuse the same row-hash helpers.
export const __hashing = {
  hashRequirement,
  hashScenario,
  hashTask,
  hashChangeRow,
  hashDeltaRow,
};

// Silence unused-import warnings for operators reserved for future filters.
void ne;
void isNull;
