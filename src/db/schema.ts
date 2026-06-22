import {
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  description: text("description"),
  rootPath: text("root_path").notNull(),
  defaultSchema: varchar("default_schema").default("spec-driven"),
  context: text("context"),
  configYaml: text("config_yaml"),
  // How this project entered the collective dashboard. Existing rows default
  // to "local"; remote-git enrollments set "remote-git" until clone+projection
  // lands with git integration (req 08.4).
  enrollmentSource: varchar("enrollment_source").default("local").notNull(),
  // Set only when enrollmentSource = "remote-git"; null for local projects.
  remoteGitUrl: text("remote_git_url"),
  // Whether this project's OpenSpec contents have been projected into the
  // dashboard. Local enrollments set this true; stubbed remote-git enrollments
  // leave it false until clone+projection lands with git integration (req 08.4).
  projected: boolean("projected").default(false).notNull(),
  // Projection lifecycle (content-projection spec, D2):
  // advanced on every successful run; null = never projected.
  lastProjectedAt: timestamp("last_projected_at"),
  // Human-readable reason a projection run failed (e.g. missing rootPath).
  projectionError: text("projection_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Spec Domains ────────────────────────────────────────────────────────────

export const specDomains = pgTable("spec_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  purpose: text("purpose"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Specs ───────────────────────────────────────────────────────────────────

export const specs = pgTable("specs", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id")
    .notNull()
    .references(() => specDomains.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  // Incremental projection (D2): SHA-256 of canonicalized source bytes.
  // null on legacy rows → always re-parse once; null is not a hash.
  contentHash: varchar("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Requirements ────────────────────────────────────────────────────────────

export const requirements = pgTable("requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  specId: uuid("spec_id")
    .notNull()
    .references(() => specs.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  body: text("body").notNull(),
  strength: varchar("strength").default("SHALL"),
  orderIndex: integer("order_index").default(0),
  contentHash: varchar("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Scenarios ───────────────────────────────────────────────────────────────

export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  requirementId: uuid("requirement_id")
    .notNull()
    .references(() => requirements.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  given: text("given").notNull(),
  when: text("when").notNull(),
  then: text("then").notNull(),
  orderIndex: integer("order_index").default(0),
  contentHash: varchar("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Changes ─────────────────────────────────────────────────────────────────

export const changes = pgTable("changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  schema: varchar("schema").default("spec-driven"),
  status: varchar("status").default("proposed").notNull(),
  description: text("description"),
  initiativeId: uuid("initiative_id"),
  contentHash: varchar("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Artifacts ───────────────────────────────────────────────────────────────

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  changeId: uuid("change_id")
    .notNull()
    .references(() => changes.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(),
  content: text("content").notNull(),
  status: varchar("status").default("draft").notNull(),
  outputPath: varchar("output_path").notNull(),
  contentHash: varchar("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Delta Specs ─────────────────────────────────────────────────────────────

export const deltaSpecs = pgTable("delta_specs", {
  id: uuid("id").primaryKey().defaultRandom(),
  changeId: uuid("change_id")
    .notNull()
    .references(() => changes.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id")
    .notNull()
    .references(() => specDomains.id, { onDelete: "cascade" }),
  deltaType: varchar("delta_type").notNull(),
  content: text("content").notNull(),
  contentHash: varchar("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  changeId: uuid("change_id")
    .notNull()
    .references(() => changes.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  groupTitle: varchar("group_title").default("General"),
  taskNumber: varchar("task_number").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  status: varchar("status").default("backlog").notNull(),
  assignee: varchar("assignee"),
  priority: varchar("priority").default("medium"),
  labels: text("labels").default("[]"),
  dueDate: timestamp("due_date"),
  orderIndex: integer("order_index").default(0),
  checked: boolean("checked").default(false),
  contentHash: varchar("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Task Comments ───────────────────────────────────────────────────────────

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  author: varchar("author").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const schemas = pgTable("schemas", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  source: varchar("source").default("project").notNull(),
  definition: text("definition").notNull(),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Schema Artifacts ────────────────────────────────────────────────────────

export const schemaArtifacts = pgTable("schema_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  schemaId: uuid("schema_id")
    .notNull()
    .references(() => schemas.id, { onDelete: "cascade" }),
  artifactId: varchar("artifact_id").notNull(),
  generates: varchar("generates").notNull(),
  requires: text("requires").default("[]"),
  instruction: text("instruction"),
  orderIndex: integer("order_index").default(0),
});

// ─── Workspaces ──────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  opener: varchar("opener"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Workspace Links ─────────────────────────────────────────────────────────

export const workspaceLinks = pgTable("workspace_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  linkName: varchar("link_name").notNull(),
  localPath: text("local_path").notNull(),
});

// ─── Context Stores ──────────────────────────────────────────────────────────

export const contextStores = pgTable("context_stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  path: text("path").notNull(),
  hasGit: boolean("has_git").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Initiatives ─────────────────────────────────────────────────────────────

export const initiatives = pgTable("initiatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  contextStoreId: uuid("context_store_id")
    .notNull()
    .references(() => contextStores.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  summary: text("summary"),
  // Initiative lifecycle (req 01.8b): proposed → active → completed → abandoned.
  // `abandoned` is reachable only from `active`, so a fresh proposal cannot
  // be abandoned without first being activated (validated at the API layer).
  status: varchar("status").default("proposed").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Verification Reports ────────────────────────────────────────────────────

export const verificationReports = pgTable("verification_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  changeId: uuid("change_id")
    .notNull()
    .references(() => changes.id, { onDelete: "cascade" }),
  completeness: text("completeness"),
  correctness: text("correctness"),
  coherence: text("coherence"),
  criticalIssues: integer("critical_issues").default(0),
  warnings: integer("warnings").default(0),
  suggestions: integer("suggestions").default(0),
  readyToArchive: boolean("ready_to_archive").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  action: varchar("action").notNull(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  details: text("details"),
  author: varchar("author"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Task 1.10 — Audit hash-chain (NFR-10, D-ArchiveSeq):
  // hash[n] = SHA256(prevHash ‖ canonical(entry) ‖ archiveSeq).
  archiveSeq: integer("archive_seq"),
  prevHash: varchar("prev_hash"),
  hash: varchar("hash"),
});
