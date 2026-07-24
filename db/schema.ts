import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  favorite: integer("favorite").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
});

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
});

export const projectItems = sqliteTable("project_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
});

export const manuscripts = sqliteTable("manuscripts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  episodeNo: integer("episode_no").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"),
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
  coverUrl: text("cover_url").notNull().default("/default-cover.png"),
  authorName: text("author_name").notNull(),
  status: text("status").notNull().default("published"),
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
  publishedAt: text("published_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("publication_episodes_publication_episode_unique").on(table.publicationId, table.episodeNo),
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
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("visible"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
