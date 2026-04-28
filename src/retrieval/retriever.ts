import { hybridSearch } from './search'
import { rerank } from './reranker'
import { rewriteQuery, expandQuery, generateHypotheticalDocument } from './expander'
import { embedQuery } from '@/lib/voyage'
import { RetrievedChunk, ChatMessage } from '@/types'

export interface RetrievalOptions {
  topK?: number
  sourceFilter?: ('notion' | 'confluence' | 'slack')[]
  useHyDE?: boolean          // default: true
  useMultiQuery?: boolean    // default: true for complex queries
  useRerank?: boolean        // default: true
}

export async function retrieve(
  query: string,
  history: ChatMessage[],
  options: RetrievalOptions = {}
): Promise<RetrievedChunk[]> {
  const {
    topK = 6,
    sourceFilter,
    useHyDE = true,
    useMultiQuery = true,
    useRerank = true,
  } = options

  // ── Step 1: Rewrite query to resolve conversation references ────────────────
  const standaloneQuery = await rewriteQuery(query, history)
  console.log(`🔄 Rewritten query: "${standaloneQuery}"`)

  // ── Step 2: Build search queries (original + expansions + HyDE) ─────────────
  const searchQueries: string[] = [standaloneQuery]

  if (useMultiQuery && standaloneQuery.split(' ').length > 4) {
    const expanded = await expandQuery(standaloneQuery)
    searchQueries.push(...expanded.slice(1))   // add rephrasings, not the original again
  }

  if (useHyDE) {
    const hypothetical = await generateHypotheticalDocument(standaloneQuery)
    searchQueries.push(hypothetical)
    console.log(`💭 HyDE doc: "${hypothetical.slice(0, 80)}..."`)
  }

  // ── Step 3: Run hybrid search for each query in parallel ────────────────────
  const searchResults = await Promise.all(
    searchQueries.map((q) =>
      hybridSearch(q, { topK: 15, sourceFilter })
    )
  )

  // ── Step 4: Deduplicate across all query results ─────────────────────────────
  const seen = new Set<string>()
  const allChunks: RetrievedChunk[] = []

  for (const results of searchResults) {
    for (const chunk of results) {
      const key = chunk.content.slice(0, 100)
      if (!seen.has(key)) {
        seen.add(key)
        allChunks.push(chunk)
      }
    }
  }

  console.log(`🔍 Retrieved ${allChunks.length} unique chunks across ${searchQueries.length} queries`)

  // ── Step 5: Rerank the merged pool ───────────────────────────────────────────
  if (useRerank && allChunks.length > topK) {
    const reranked = await rerank(standaloneQuery, allChunks)
    console.log(`🏅 Reranked to top ${reranked.length} chunks`)
    return reranked
  }

  return allChunks.slice(0, topK)
}