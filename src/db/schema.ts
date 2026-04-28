import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  varchar,
  index,
} from 'drizzle-orm/pg-core'

// ─── Sync state — tracks last successful sync per source ─────────────────────

export const syncState = pgTable('sync_state', {
  id: varchar('id', { length: 50 }).primaryKey(),  // e.g. "notion", "confluence", "slack"
  lastSyncedAt: timestamp('last_synced_at').notNull(),
  lastSyncStatus: varchar('last_sync_status', { length: 20 })
    .notNull()
    .default('success'),          // 'success' | 'failed' | 'running'
  documentsIndexed: integer('documents_indexed').notNull().default(0),
  chunksIndexed: integer('chunks_indexed').notNull().default(0),
  errorMessage: text('error_message'),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─── Query analytics — every question asked + quality signals ─────────────────

export const queryLog = pgTable(
  'query_log',
  {
    id: varchar('id', { length: 100 }).primaryKey(),
    query: text('query').notNull(),
    rewrittenQuery: text('rewritten_query'),
    chunksRetrieved: integer('chunks_retrieved').notNull().default(0),
    sources: jsonb('sources'),                 // ["notion", "slack"]
    responseTimeMs: integer('response_time_ms'),
    thumbsUp: boolean('thumbs_up'),            // user feedback
    langfuseTraceId: varchar('langfuse_trace_id', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    createdAtIdx: index('query_log_created_at_idx').on(t.createdAt),
  })
)

// ─── Document registry — tracks every indexed doc for deletion sync ───────────

export const documentRegistry = pgTable(
  'document_registry',
  {
    id: varchar('id', { length: 200 }).primaryKey(),  // e.g. "notion-<pageId>"
    source: varchar('source', { length: 20 }).notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    lastEditedAt: timestamp('last_edited_at').notNull(),
    chunkCount: integer('chunk_count').notNull().default(0),
    qdrantPointIds: jsonb('qdrant_point_ids'),  // array of point IDs for cleanup
    indexedAt: timestamp('indexed_at').defaultNow(),
  },
  (t) => ({
    sourceIdx: index('doc_registry_source_idx').on(t.source),
    lastEditedIdx: index('doc_registry_last_edited_idx').on(t.lastEditedAt),
  })
)