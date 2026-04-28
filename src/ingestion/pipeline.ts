import { fetchNotionDocuments } from "./sources/notion";
import { fetchConfluenceDocuments } from "./sources/confluence";
import { fetchSlackDocuments } from "./sources/slack";
import { chunkDocuments } from "./chunker";
import { embedAndStore } from "./embedder";
import { db } from "@/db/client";
import { syncState } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SourceType, RawDocument, IngestResult } from "@/types";

type SourceFetcher = (
  cursor?: string
) => Promise<{ documents: RawDocument[]; nextCursor?: string }>;

const SOURCE_FETCHERS: Record<SourceType, SourceFetcher> = {
  notion: fetchNotionDocuments,
  confluence: fetchConfluenceDocuments,
  slack: fetchSlackDocuments,
};

/**
 * Runs the full ingestion pipeline for the specified sources.
 * Steps: fetch → chunk → embed → store → update sync state
 */
export async function runPipeline(
  sources: SourceType[] = ["notion", "confluence", "slack"]
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];

  for (const source of sources) {
    console.log(`\n🔄 Starting ${source} ingestion...`);
    const start = Date.now();
    const errors: string[] = [];
    let totalDocs = 0;
    let totalChunks = 0;
    let totalEmbeddings = 0;

    try {
      // Update sync status
      await updateSyncStatus(source, "syncing");

      // Fetch documents (paginated)
      const fetcher = SOURCE_FETCHERS[source];
      let cursor: string | undefined;
      const allDocuments: RawDocument[] = [];

      do {
        const result = await fetcher(cursor);
        allDocuments.push(...result.documents);
        cursor = result.nextCursor;
      } while (cursor);

      totalDocs = allDocuments.length;
      console.log(`  📄 Fetched ${totalDocs} documents from ${source}`);

      if (totalDocs === 0) {
        await updateSyncStatus(source, "idle");
        results.push({
          sourceType: source,
          documentsProcessed: 0,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          duration: Date.now() - start,
          errors,
        });
        continue;
      }

      // Chunk documents
      const chunks = await chunkDocuments(allDocuments);
      totalChunks = chunks.length;
      console.log(`  ✂️  Created ${totalChunks} chunks`);

      // Embed and store
      totalEmbeddings = await embedAndStore(chunks);
      console.log(`  ✅ Stored ${totalEmbeddings} embeddings in Qdrant`);

      // Update sync state
      await updateSyncStatus(source, "idle", totalDocs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      console.error(`  ❌ Error in ${source} pipeline: ${message}`);
      await updateSyncStatus(source, "error", undefined, message);
    }

    results.push({
      sourceType: source,
      documentsProcessed: totalDocs,
      chunksCreated: totalChunks,
      embeddingsGenerated: totalEmbeddings,
      duration: Date.now() - start,
      errors,
    });
  }

  return results;
}

// ─── Sync State Helpers ────────────────────────────────────────────

async function updateSyncStatus(
  source: SourceType,
  status: "idle" | "syncing" | "error",
  documentCount?: number,
  errorMessage?: string
): Promise<void> {
  const existing = await db
    .select()
    .from(syncState)
    .where(eq(syncState.sourceType, source))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(syncState).values({
      sourceType: source,
      status,
      documentCount: documentCount ?? 0,
      errorMessage: errorMessage ?? null,
      lastSyncedAt: status === "idle" ? new Date() : null,
    });
  } else {
    await db
      .update(syncState)
      .set({
        status,
        ...(documentCount !== undefined && { documentCount }),
        ...(errorMessage !== undefined && { errorMessage }),
        ...(status === "idle" && { lastSyncedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(syncState.sourceType, source));
  }
}
