import { QdrantClient } from "@qdrant/js-client-rest";

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  return client;
}

export const COLLECTION_NAME = "rag-brain";
export const VECTOR_SIZE = 1024; // Voyage AI voyage-3 dimension

/**
 * Ensures the Qdrant collection exists with the correct config.
 * Safe to call multiple times (idempotent).
 */
export async function ensureCollection(): Promise<void> {
  const qdrant = getQdrantClient();

  const collections = await qdrant.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === COLLECTION_NAME
  );

  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Create payload indexes for filtering
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "sourceType",
      field_schema: "keyword",
    });

    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "documentId",
      field_schema: "keyword",
    });

    console.log(`✅ Created Qdrant collection: ${COLLECTION_NAME}`);
  }
}
