import { getVoyageClient, VOYAGE_MODEL } from "@/lib/voyage";
import { getQdrantClient, COLLECTION_NAME, ensureCollection } from "@/lib/qdrant";
import type { Chunk, EmbeddedChunk } from "@/types";

const BATCH_SIZE = 128; // Voyage AI max batch size

/**
 * Generates embeddings for chunks via Voyage AI and upserts them to Qdrant.
 * Processes in batches to respect API limits.
 */
export async function embedAndStore(chunks: Chunk[]): Promise<number> {
  await ensureCollection();

  const voyage = getVoyageClient();
  const qdrant = getQdrantClient();
  let totalEmbedded = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    // Generate embeddings
    const response = await voyage.embed({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: "document",
    });

    // Combine chunks with their embeddings
    const embeddedChunks: EmbeddedChunk[] = batch.map((chunk, idx) => ({
      ...chunk,
      embedding: response.data[idx].embedding,
    }));

    // Upsert to Qdrant
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: embeddedChunks.map((ec) => ({
        id: ec.id,
        vector: ec.embedding,
        payload: {
          content: ec.content,
          documentId: ec.documentId,
          sourceType: ec.metadata.sourceType,
          sourceId: ec.metadata.sourceId,
          title: ec.metadata.title,
          url: ec.metadata.url ?? "",
          author: ec.metadata.author ?? "",
          lastModified: ec.metadata.lastModified,
          chunkIndex: ec.metadata.chunkIndex,
          totalChunks: ec.metadata.totalChunks,
        },
      })),
    });

    totalEmbedded += batch.length;
    console.log(
      `  📦 Embedded batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} chunks`
    );
  }

  return totalEmbedded;
}

/**
 * Generates a query embedding for retrieval.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const voyage = getVoyageClient();

  const response = await voyage.embed({
    input: query,
    model: VOYAGE_MODEL,
    input_type: "query",
  });

  return response.data[0].embedding;
}
