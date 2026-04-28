import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ─────────────────────────────────────────────────────────

export const sourceTypeEnum = pgEnum("source_type", [
  "notion",
  "confluence",
  "slack",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "idle",
  "syncing",
  "error",
]);

// ─── Sync State ────────────────────────────────────────────────────

export const syncState = pgTable("sync_state", {
  id: serial("id").primaryKey(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastCursor: text("last_cursor"),
  documentCount: integer("document_count").notNull().default(0),
  status: syncStatusEnum("status").notNull().default("idle"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Ingested Documents (metadata only) ────────────────────────────

export const ingestedDocuments = pgTable("ingested_documents", {
  id: serial("id").primaryKey(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  sourceId: text("source_id").notNull().unique(),
  title: text("title").notNull(),
  url: text("url"),
  contentHash: text("content_hash").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  lastModified: timestamp("last_modified", { withTimezone: true }),
  ingestedAt: timestamp("ingested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
