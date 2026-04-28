import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant";
import { embedQuery } from "@/ingestion/embedder";
import type { SearchResult } from "@/types";

const DEFAULT_TOP_K = 20;

/**
 * Performs hybrid search against Qdrant:
 * 1. Dense vector search using Voyage AI embeddings
 * 2. Optional source-type filtering
 */
export async function hybridSearch(
  query: string,
  topK: number = DEFAULT_TOP_K,
  sourceFilter?: string
): Promise<SearchResult[]> {
  const qdrant = getQdrantClient();

  // Generate query embedding
  const queryVector = await embedQuery(query);

  // Build filter if source type is specified
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> | undefined = sourceFilter
    ? {
        must: [
          {
            key: "sourceType",
            match: { value: sourceFilter },
          },
        ],
      }
    : undefined;

  // Search Qdrant
  const results = await qdrant.search(COLLECTION_NAME, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
    score_threshold: 0.3,
    ...(filter && { filter }),
  });

  return results.map((result) => ({
    id: typeof result.id === "string" ? result.id : String(result.id),
    content: (result.payload?.content as string) ?? "",
    score: result.score,
    metadata: {
      sourceType: (result.payload?.sourceType as "notion" | "confluence" | "slack") ?? "notion",
      sourceId: (result.payload?.sourceId as string) ?? "",
      title: (result.payload?.title as string) ?? "",
      url: (result.payload?.url as string) || undefined,
      author: (result.payload?.author as string) || undefined,
      lastModified: (result.payload?.lastModified as string) ?? "",
      chunkIndex: (result.payload?.chunkIndex as number) ?? 0,
      totalChunks: (result.payload?.totalChunks as number) ?? 1,
    },
  }));
}
