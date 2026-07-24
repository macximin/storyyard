import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
