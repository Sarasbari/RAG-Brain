import { RetrievedChunk } from '@/types'

// Uses Cohere Rerank API — 1000 free calls/month
// Cross-encoder: reads query + each document TOGETHER, much more accurate
// than bi-encoder similarity scores

const COHERE_RERANK_URL = 'https://api.cohere.com/v2/rerank'
const TOP_N = 6   // how many to keep after reranking

export async function rerank(
  query: string,
  chunks: RetrievedChunk[]
): Promise<RetrievedChunk[]> {
  // Skip reranking if not enough chunks or no API key
  if (chunks.length <= 3) return chunks
  if (!process.env.COHERE_API_KEY) {
    console.warn('⚠️  No COHERE_API_KEY — skipping rerank, using top-6 by score')
    return chunks.slice(0, TOP_N)
  }

  try {
    const res = await fetch(COHERE_RERANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
        'X-Client-Name': 'production-rag',
      },
      body: JSON.stringify({
        model: 'rerank-v3.5',
        query,
        documents: chunks.map((c) => c.content),
        top_n: TOP_N,
        return_documents: false,
      }),
    })

    if (!res.ok) throw new Error(await res.text())

    const data = await res.json()

    // Map reranked indices back to original chunks with new scores
    return data.results.map((r: any) => ({
      ...chunks[r.index],
      score: r.relevance_score,
    }))
  } catch (err) {
    console.warn(`⚠️  Rerank failed: ${(err as Error).message} — using original order`)
    return chunks.slice(0, TOP_N)
  }
}