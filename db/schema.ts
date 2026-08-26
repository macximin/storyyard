import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  ownerKey: text("owner_key").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("users_username_unique").on(table.username),
  uniqueIndex("users_owner_key_unique").on(table.ownerKey),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  humanActionTokenHash: text("human_action_token_hash").notNull().default(""),
  humanActionProjectId: text("human_action_project_id").notNull().default(""),
  humanActionKind: text("human_action_kind").notNull().default(""),
  humanActionExpiresAt: text("human_action_expires_at").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  logline: text("logline").notNull().default(""),
  genre: text("genre").notNull().default("웹소설"),
  coverKey: text("cover_key").notNull().default("overall-revision"),
  favorite: integer("favorite").notNull().default(0),
  contentRevision: text("content_revision").notNull().default(""),
  lifecycle: text("lifecycle").notNull().default("active"),
  sourceSystem: text("source_system").notNull().default("manual"),
  archivedAt: text("archived_at"),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("projects_owner_updated_idx").on(table.ownerEmail, table.updatedAt),
]);

export const plotBlocks = sqliteTable("plot_blocks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  act: integer("act").notNull(),
  kind: text("kind").notNull().default("scene"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("plot_blocks_project_act_sort_idx").on(table.projectId, table.act, table.sortOrder),
]);

export const projectItems = sqliteTable("project_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("project_items_project_kind_updated_idx").on(table.projectId, table.kind, table.updatedAt),
]);

export const manuscripts = sqliteTable("manuscripts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  episodeNo: integer("episode_no").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"),
  meta: text("meta").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("manuscripts_project_episode_unique").on(table.projectId, table.episodeNo),
]);

export const publications = sqliteTable("publications", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  logline: text("logline").notNull().default(""),
  genre: text("genre").notNull().default("웹소설"),
  coverKey: text("cover_key").notNull().default("overall-revision"),
  coverUrl: text("cover_url").notNull().default("/default-cover.png"),
  authorName: text("author_name").notNull(),
  status: text("status").notNull().default("published"),
  publishedRevision: text("published_revision").notNull().default(""),
  publishedAt: text("published_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("publications_project_unique").on(table.projectId),
  uniqueIndex("publications_slug_unique").on(table.slug),
]);

export const publicationEpisodes = sqliteTable("publication_episodes", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id").notNull(),
  sourceManuscriptId: text("source_manuscript_id").notNull(),
  episodeNo: integer("episode_no").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  publishedAt: text("published_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("publication_episodes_publication_episode_unique").on(table.publicationId, table.episodeNo),
]);

// One project can be bound to one approved Foundry work revision. The binding
// makes private and public projections independently verifiable without making
// Storyyard an authority for canon.
export const canonBindings = sqliteTable("canon_bindings", {
  projectId: text("project_id").primaryKey(),
  workSlug: text("work_slug").notNull(),
  sourceCommit: text("source_commit").notNull(),
  bundleSha256: text("bundle_sha256").notNull(),
  revisionSetSha256: text("revision_set_sha256").notNull(),
  syncedAt: text("synced_at").notNull(),
}, (table) => [
  index("canon_bindings_work_slug_idx").on(table.workSlug),
]);

// 공개 페이지는 작업실 원본을 직접 읽지 않고, 작가가 고른 정보만 이 스냅샷에 복사한다.
export const publicationContent = sqliteTable("publication_content", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id").notNull(),
  sourceId: text("source_id").notNull(),
  kind: text("kind").notNull(),
  parentSourceId: text("parent_source_id").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("publication_content_source_unique").on(table.publicationId, table.kind, table.sourceId),
  index("publication_content_lookup_idx").on(table.publicationId, table.kind, table.sortOrder),
]);

export const publicationFavorites = sqliteTable("publication_favorites", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("publication_favorites_user_work_unique").on(table.userId, table.publicationId),
]);

export const ratings = sqliteTable("ratings", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id").notNull(),
  userId: text("user_id").notNull(),
  value: integer("value").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("ratings_user_work_unique").on(table.userId, table.publicationId),
]);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id").notNull(),
  episodeId: text("episode_id"),
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("visible"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("comments_publication_episode_idx").on(table.publicationId, table.episodeId),
]);

// Foundry remains the source of truth. These rows preserve imported snapshots and
// human decisions; they never mutate a Foundry work directly.
export const canonSnapshots = sqliteTable("canon_snapshots", {
  id: text("id").primaryKey(),
  workSlug: text("work_slug").notNull(),
  schemaVersion: text("schema_version").notNull(),
  workflowSchema: text("workflow_schema").notNull(),
  bundleSha256: text("bundle_sha256").notNull(),
  revisionSetSha256: text("revision_set_sha256").notNull().default(""),
  title: text("title").notNull(),
  payload: text("payload").notNull(),
  sourcePath: text("source_path").notNull(),
  sourceUpdatedAt: text("source_updated_at").notNull(),
  importedAt: text("imported_at").notNull(),
}, (table) => [
  uniqueIndex("canon_snapshots_bundle_unique").on(table.bundleSha256),
  index("canon_snapshots_work_imported_idx").on(table.workSlug, table.importedAt),
]);

export const canonDecisions = sqliteTable("canon_decisions", {
  id: text("id").primaryKey(),
  workSlug: text("work_slug").notNull(),
  bundleSha256: text("bundle_sha256").notNull(),
  artifactKey: text("artifact_key").notNull(),
  artifactSha256: text("artifact_sha256").notNull(),
  decision: text("decision").notNull(),
  comment: text("comment").notNull().default(""),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  appliedAt: text("applied_at"),
  applyReceiptPath: text("apply_receipt_path"),
}, (table) => [
  index("canon_decisions_work_created_idx").on(table.workSlug, table.createdAt),
  index("canon_decisions_pending_idx").on(table.status, table.workSlug),
]);

// InkOS remains canonical. Storyyard stores immutable review projections and
// pending human decisions only; InkOS applies accepted decisions later.
export const fireflyReviewSnapshots = sqliteTable("firefly_review_snapshots", {
  packetId: text("packet_id").primaryKey(),
  packetSha256: text("packet_sha256").notNull(),
  schemaVersion: text("schema_version").notNull(),
  bookId: text("book_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  title: text("title").notNull(),
  payload: text("payload").notNull(),
  sourceRevision: text("source_revision").notNull(),
  generatedAt: text("generated_at").notNull(),
  importedAt: text("imported_at").notNull(),
}, (table) => [
  uniqueIndex("firefly_review_snapshots_sha_unique").on(table.packetSha256),
  index("firefly_review_snapshots_book_generated_idx").on(table.bookId, table.generatedAt),
]);

export const fireflyReviewDecisions = sqliteTable("firefly_review_decisions", {
  id: text("id").primaryKey(),
  packetId: text("packet_id").notNull(),
  packetSha256: text("packet_sha256").notNull(),
  bookId: text("book_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  candidateId: text("candidate_id").notNull().default(""),
  candidateSha256: text("candidate_sha256").notNull().default(""),
  decision: text("decision").notNull(),
  comment: text("comment").notNull().default(""),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  appliedAt: text("applied_at"),
  applyReceiptPath: text("apply_receipt_path"),
}, (table) => [
  index("firefly_review_decisions_packet_created_idx").on(table.packetId, table.createdAt),
  index("firefly_review_decisions_pending_idx").on(table.status, table.bookId),
]);
