import { fetchNotionDocuments } from './sources/notion'
import { fetchConfluenceDocuments } from './sources/confluence'
import { fetchSlackDocuments } from './sources/slack'
import { chunkDocuments } from './chunker'
import { embedChunks } from './embedder'
import { qdrant, COLLECTION_NAME, ensureCollection } from '@/lib/qdrant'
import { EmbeddedChunk } from '@/types'

const UPSERT_BATCH_SIZE = 100

async function upsertToQdrant(chunks: EmbeddedChunk[]) {
  console.log(`📦 Upserting ${chunks.length} vectors to Qdrant...`)

  for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + UPSERT_BATCH_SIZE)

    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch.map((chunk) => ({
        id: hashId(chunk.id),          // Qdrant needs numeric or UUID ids
        vector: chunk.embedding,
        payload: {
          content: chunk.content,
          docId: chunk.docId,
          chunkId: chunk.id,
          ...chunk.metadata,
        },
      })),
    })

    console.log(
      `  Upserted ${Math.min(i + UPSERT_BATCH_SIZE, chunks.length)}/${chunks.length}`
    )
  }

  console.log(`✅ Upsert complete\n`)
}

// Deterministic string → positive integer for Qdrant point IDs
function hashId(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runPipeline(options: {
  sources?: ('notion' | 'confluence' | 'slack')[]
  since?: string   // ISO date for incremental sync
}) {
  const { sources = ['notion', 'confluence', 'slack'], since } = options

  console.log('🚀 Starting ingestion pipeline...\n')
  console.log(`Sources: ${sources.join(', ')}`)
  console.log(`Mode: ${since ? `incremental (since ${since})` : 'full sync'}\n`)

  await ensureCollection()

  // 1. Fetch from all sources in parallel
  const fetchPromises = []
  if (sources.includes('notion'))
    fetchPromises.push(fetchNotionDocuments(since))
  if (sources.includes('confluence'))
    fetchPromises.push(fetchConfluenceDocuments(since))
  if (sources.includes('slack'))
    fetchPromises.push(fetchSlackDocuments(since))

  const results = await Promise.all(fetchPromises)
  const allDocuments = results.flat()

  if (allDocuments.length === 0) {
    console.log('✅ Nothing new to ingest.')
    return
  }

  console.log(`📚 Total documents fetched: ${allDocuments.length}\n`)

  // 2. Chunk
  const chunks = await chunkDocuments(allDocuments)

  // 3. Embed
  const embeddedChunks = await embedChunks(chunks)

  // 4. Upsert to Qdrant
  await upsertToQdrant(embeddedChunks)

  console.log(`\n🎉 Pipeline complete!`)
  console.log(`   Documents: ${allDocuments.length}`)
  console.log(`   Chunks: ${chunks.length}`)
  console.log(`   Vectors stored: ${embeddedChunks.length}`)
}