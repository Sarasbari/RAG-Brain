import { QdrantClient } from '@qdrant/js-client-rest'

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY || undefined,
})

export const COLLECTION_NAME = 'knowledge_base'
export const VECTOR_SIZE = 1024   // voyage-3-lite output dimension

export async function ensureCollection() {
  const collections = await qdrant.getCollections()
  const exists = collections.collections.some(
    (c) => c.name === COLLECTION_NAME
  )

  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
    })
    console.log(`✅ Created Qdrant collection: ${COLLECTION_NAME}`)
  }
}