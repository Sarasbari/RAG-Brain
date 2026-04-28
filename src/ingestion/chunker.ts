import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import type { RawDocument, Chunk, ChunkMetadata } from "@/types";
import { randomUUID } from "crypto";

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n", "\n", ". ", " ", ""],
});

/**
 * Splits a raw document into overlapping chunks.
 * Each chunk retains metadata from the parent document.
 */
export async function chunkDocument(doc: RawDocument): Promise<Chunk[]> {
  const textChunks = await splitter.splitText(doc.content);

  return textChunks.map((text, index) => {
    const metadata: ChunkMetadata = {
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      title: doc.title,
      url: doc.url,
      author: doc.author,
      lastModified: doc.lastModified.toISOString(),
      chunkIndex: index,
      totalChunks: textChunks.length,
    };

    return {
      id: randomUUID(),
      documentId: doc.id,
      content: text,
      tokenCount: estimateTokenCount(text),
      index,
      metadata,
    };
  });
}

/**
 * Batch-chunk multiple documents.
 */
export async function chunkDocuments(docs: RawDocument[]): Promise<Chunk[]> {
  const allChunks: Chunk[] = [];
  for (const doc of docs) {
    const chunks = await chunkDocument(doc);
    allChunks.push(...chunks);
  }
  return allChunks;
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Rough token estimate (~4 chars per token for English) */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
