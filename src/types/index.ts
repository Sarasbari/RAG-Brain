// ─── Document & Chunk Types ────────────────────────────────────────

export type SourceType = "notion" | "confluence" | "slack";

export interface RawDocument {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  title: string;
  content: string;
  url?: string;
  author?: string;
  lastModified: Date;
  metadata: Record<string, unknown>;
}

export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  tokenCount: number;
  index: number;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  sourceType: SourceType;
  sourceId: string;
  title: string;
  url?: string;
  author?: string;
  lastModified: string;
  chunkIndex: number;
  totalChunks: number;
}

// ─── Embedding Types ───────────────────────────────────────────────

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

// ─── Retrieval Types ───────────────────────────────────────────────

export interface RetrievedChunk {
  content: string;
  score: number;
  metadata: {
    title: string;
    url: string;
    source: SourceType;
    author: string;
    lastEditedAt: string;
    chunkIndex: number;
  };
}

export interface Citation {
  index: number;
  title: string;
  url: string;
  source: SourceType;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: ChunkMetadata;
}

export interface RerankedResult extends SearchResult {
  originalScore: number;
  rerankedScore: number;
}

export interface RetrievalContext {
  query: string;
  expandedQueries: string[];
  results: RerankedResult[];
  totalTokens: number;
}

// ─── Chat Types ────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
}

export interface ChatResponse {
  message: ChatMessage;
  sources: SourceReference[];
  traceId?: string;
}

export interface SourceReference {
  title: string;
  url?: string;
  sourceType: SourceType;
  relevanceScore: number;
}

// ─── Sync State Types ──────────────────────────────────────────────

export interface SyncState {
  id: number;
  sourceType: SourceType;
  lastSyncedAt: Date;
  lastCursor?: string;
  documentCount: number;
  status: "idle" | "syncing" | "error";
  errorMessage?: string;
}

// ─── Pipeline Types ────────────────────────────────────────────────

export interface IngestResult {
  sourceType: SourceType;
  documentsProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  duration: number;
  errors: string[];
}
