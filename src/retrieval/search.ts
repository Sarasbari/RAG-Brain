import { qdrant, COLLECTION_NAME } from '@/lib/qdrant'
import { embedQuery } from '@/lib/voyage'
import { RetrievedChunk } from '@/types'

const TOP_K = 20   // fetch more than you need — reranker will trim to top 5-8

// ─── Dense vector search (semantic) ──────────────────────────────────────────

async function denseSearch(
  queryEmbedding: number[],
  topK: number,
  filter?: Record<string, any>
): Promise<RetrievedChunk[]> {
  const results = await qdrant.search(COLLECTION_NAME, {
    vector: queryEmbedding,
    limit: topK,
    with_payload: true,
    filter,
  })

  return results.map((r) => ({
    content: r.payload?.content as string,
    score: r.score,
    metadata: {
      title: r.payload?.title as string,
      url: r.payload?.url as string,
      source: r.payload?.source as any,
      author: r.payload?.author as string,
      lastEditedAt: r.payload?.lastEditedAt as string,
      chunkIndex: r.payload?.chunkIndex as number,
    },
  }))
}

// ─── BM25 keyword search (sparse) ────────────────────────────────────────────
// Qdrant's full-text search — exact keyword matching

async function sparseSearch(
  query: string,
  topK: number,
  filter?: Record<string, any>
): Promise<RetrievedChunk[]> {
  const results = await qdrant.search(COLLECTION_NAME, {
    vector: { name: 'text', vector: query } as any,
    limit: topK,
    with_payload: true,
    filter,
  })

  // Fallback: if sparse vectors aren't set up yet, use scroll + substring match
  // This is the graceful degradation path for v1
  if (!results.length) {
    return keywordFallback(query, topK)
  }

  return results.map((r) => ({
    content: r.payload?.content as string,
    score: r.score,
    metadata: {
      title: r.payload?.title as string,
      url: r.payload?.url as string,
      source: r.payload?.source as any,
      author: r.payload?.author as string,
      lastEditedAt: r.payload?.lastEditedAt as string,
      chunkIndex: r.payload?.chunkIndex as number,
    },
  }))
}

// ─── Keyword fallback (no sparse vectors needed) ──────────────────────────────
// Simple but effective for v1 — scroll through and filter by keyword presence

async function keywordFallback(
  query: string,
  topK: number
): Promise<RetrievedChunk[]> {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)   // skip stop words

  if (!keywords.length) return []

  const results = await qdrant.scroll(COLLECTION_NAME, {
    filter: {
      must: keywords.slice(0, 3).map((keyword) => ({
        key: 'content',
        match: { text: keyword },
      })),
    },
    limit: topK,
    with_payload: true,
  })

  return (results.points ?? []).map((r) => ({
    content: r.payload?.content as string,
    score: 0.5,   // static score for keyword matches
    metadata: {
      title: r.payload?.title as string,
      url: r.payload?.url as string,
      source: r.payload?.source as any,
      author: r.payload?.author as string,
      lastEditedAt: r.payload?.lastEditedAt as string,
      chunkIndex: r.payload?.chunkIndex as number,
    },
  }))
}

// ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────
// Merges two ranked lists into one. Better than averaging scores.
// Formula: RRF(d) = Σ 1 / (k + rank(d))  where k=60 is standard

function reciprocalRankFusion(
  denseResults: RetrievedChunk[],
  sparseResults: RetrievedChunk[],
  k = 60
): RetrievedChunk[] {
  const scores = new Map<string, number>()
  const chunks = new Map<string, RetrievedChunk>()

  // Score dense results
  denseResults.forEach((chunk, rank) => {
    const key = chunk.content.slice(0, 100)   // use content prefix as dedup key
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1))
    chunks.set(key, chunk)
  })

  // Score sparse results — same formula, additive
  sparseResults.forEach((chunk, rank) => {
    const key = chunk.content.slice(0, 100)
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1))
    chunks.set(key, chunk)
  })

  // Sort by combined RRF score descending
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, score]) => ({
      ...chunks.get(key)!,
      score,
    }))
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function hybridSearch(
  query: string,
  options: {
    topK?: number
    sourceFilter?: ('notion' | 'confluence' | 'slack')[]
  } = {}
): Promise<RetrievedChunk[]> {
  const { topK = TOP_K, sourceFilter } = options

  const filter = sourceFilter?.length
    ? {
        must: [{
          key: 'source',
          match: { any: sourceFilter },
        }],
      }
    : undefined

  // Embed query for dense search
  const queryEmbedding = await embedQuery(query)

  // Run dense + sparse searches in parallel
  const [denseResults, sparseResults] = await Promise.all([
    denseSearch(queryEmbedding, topK, filter),
    sparseSearch(query, topK, filter),
  ])

  // Merge via RRF
  const merged = reciprocalRankFusion(denseResults, sparseResults)

  return merged.slice(0, topK)
}