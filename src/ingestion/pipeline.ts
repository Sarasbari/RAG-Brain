import { fetchNotionDocuments } from './sources/notion'
import { fetchConfluenceDocuments } from './sources/confluence'
import { fetchSlackDocuments } from './sources/slack'
import { chunkDocuments } from './chunker'
import { embedChunks } from './embedder'
import { qdrant, COLLECTION_NAME, ensureCollection } from '@/lib/qdrant'
import { db } from '@/db/client'
import { syncState, documentRegistry } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { EmbeddedChunk, RawDocument, SourceType } from '@/types'

const UPSERT_BATCH_SIZE = 100

async function upsertToQdrant(chunks: EmbeddedChunk[]) {
  console.log(`📦 Upserting ${chunks.length} vectors to Qdrant...`)

  for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + UPSERT_BATCH_SIZE)

    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch.map((chunk) => ({
        id: hashId(chunk.id),
        vector: chunk.embedding,
        payload: {
          content: chunk.content,
          documentId: chunk.documentId,
          chunkId: chunk.id,
          ...chunk.metadata,
        },
      })),
    })

    const progress = Math.min(i + UPSERT_BATCH_SIZE, chunks.length)
    console.log(`  Upserted ${progress}/${chunks.length}`)
  }
}

function hashId(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ─── Get last sync time from DB ───────────────────────────────────────────────

export async function getLastSyncTime(
  source: SourceType
): Promise<string | undefined> {
  const row = await db
    .select()
    .from(syncState)
    .where(eq(syncState.id, source))
    .limit(1)

  return row[0]?.lastSyncedAt?.toISOString()
}

// ─── Save sync result to DB ───────────────────────────────────────────────────

async function saveSyncState(
  source: SourceType,
  status: 'success' | 'failed',
  stats: { documents: number; chunks: number },
  error?: string
) {
  await db
    .insert(syncState)
    .values({
      id: source,
      lastSyncedAt: new Date(),
      lastSyncStatus: status,
      documentsIndexed: stats.documents,
      chunksIndexed: stats.chunks,
      errorMessage: error,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        lastSyncedAt: new Date(),
        lastSyncStatus: status,
        documentsIndexed: stats.documents,
        chunksIndexed: stats.chunks,
        errorMessage: error ?? null,
        updatedAt: new Date(),
      },
    })
}

// ─── Register documents in DB for future deletion tracking ───────────────────

async function registerDocuments(chunks: EmbeddedChunk[]) {
  // Group chunks by documentId
  const docMap = new Map<string, EmbeddedChunk[]>()
  for (const chunk of chunks) {
    const arr = docMap.get(chunk.documentId) ?? []
    arr.push(chunk)
    docMap.set(chunk.documentId, arr)
  }

  for (const [docId, docChunks] of docMap.entries()) {
    const first = docChunks[0]
    await db
      .insert(documentRegistry)
      .values({
        id: docId,
        source: first.metadata.sourceType,
        title: first.metadata.title,
        url: first.metadata.url ?? '',
        lastEditedAt: new Date(first.metadata.lastModified),
        chunkCount: docChunks.length,
        qdrantPointIds: docChunks.map((c) => hashId(c.id)),
        indexedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: documentRegistry.id,
        set: {
          lastEditedAt: new Date(first.metadata.lastModified),
          chunkCount: docChunks.length,
          qdrantPointIds: docChunks.map((c) => hashId(c.id)),
          indexedAt: new Date(),
        },
      })
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runPipeline(options: {
  sources?: SourceType[]
  since?: string
  incremental?: boolean   // if true, auto-reads last sync time from DB
}) {
  const {
    sources = ['notion', 'confluence', 'slack'],
    incremental = false,
  } = options

  console.log('🚀 Starting ingestion pipeline...\n')
  await ensureCollection()

  const totalStats = { documents: 0, chunks: 0 }

  for (const source of sources) {
    console.log(`\n── Processing source: ${source} ──`)

    // Auto-read last sync time for incremental mode
    const since = incremental
      ? await getLastSyncTime(source)
      : options.since

    if (since) {
      console.log(`  Mode: incremental (since ${since})`)
    } else {
      console.log(`  Mode: full sync`)
    }

    try {
      // Mark as running
      await saveSyncState(source, 'success', { documents: 0, chunks: 0 })

      // 1. Fetch
      let documents: RawDocument[] = []
      if (source === 'notion') documents = await fetchNotionDocuments(since)
      if (source === 'confluence') documents = await fetchConfluenceDocuments(since)
      if (source === 'slack') documents = await fetchSlackDocuments(since)

      if (documents.length === 0) {
        console.log(`  ✅ Nothing new for ${source}`)
        continue
      }

      // 2. Chunk
      const chunks = await chunkDocuments(documents)

      // 3. Embed
      const embeddedChunks = await embedChunks(chunks)

      // 4. Upsert to Qdrant
      await upsertToQdrant(embeddedChunks)

      // 5. Register in DB
      await registerDocuments(embeddedChunks)

      // 6. Save sync state
      await saveSyncState(source, 'success', {
        documents: documents.length,
        chunks: embeddedChunks.length,
      })

      totalStats.documents += documents.length
      totalStats.chunks += embeddedChunks.length

      console.log(`  ✅ ${source}: ${documents.length} docs, ${embeddedChunks.length} chunks`)
    } catch (err) {
      const message = (err as Error).message
      console.error(`  ✗ ${source} failed: ${message}`)
      await saveSyncState(source, 'failed', { documents: 0, chunks: 0 }, message)
    }
  }

  console.log(`\n🎉 Pipeline complete!`)
  console.log(`   Total documents: ${totalStats.documents}`)
  console.log(`   Total chunks: ${totalStats.chunks}`)
}