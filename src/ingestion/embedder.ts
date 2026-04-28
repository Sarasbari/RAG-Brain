import { EmbeddedChunk, Chunk } from '@/types'

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const MODEL = 'voyage-3-lite'   // free tier model, 1024 dimensions
const BATCH_SIZE = 128           // Voyage AI max batch size

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
      input_type: 'document',   // use 'query' at query time
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Voyage AI error: ${err}`)
  }

  const data = await res.json()

  // Voyage returns embeddings in same order as input
  return data.data.map((d: any) => d.embedding)
}

export async function embedChunks(
  chunks: Chunk[]
): Promise<EmbeddedChunk[]> {
  console.log(`🔢 Embedding ${chunks.length} chunks via Voyage AI...`)

  const embedded: EmbeddedChunk[] = []

  // Process in batches to respect rate limits
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map((c) => c.content)

    const embeddings = await embedBatch(texts)

    batch.forEach((chunk, j) => {
      embedded.push({ ...chunk, embedding: embeddings[j] })
    })

    const progress = Math.min(i + BATCH_SIZE, chunks.length)
    console.log(`  ${progress}/${chunks.length} chunks embedded`)

    // Small delay to avoid rate limit on free tier
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  console.log(`✅ Embedding complete\n`)
  return embedded
}