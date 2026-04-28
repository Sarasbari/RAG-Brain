import { expandQuery } from "./expander";
import { hybridSearch } from "./search";
import { rerank } from "./reranker";
import type { RetrievalContext, SearchResult } from "@/types";

const MAX_CONTEXT_TOKENS = 6000;

/**
 * Full retrieval pipeline:
 * 1. Expand query → multiple search queries + HyDE
 * 2. Search Qdrant with each expanded query
 * 3. Deduplicate results
 * 4. Rerank with cross-encoder
 * 5. Trim to token budget
 */
export async function retrieve(query: string): Promise<RetrievalContext> {
  // Step 1: Expand query
  const expandedQueries = await expandQuery(query);
  console.log(`🔍 Expanded into ${expandedQueries.length} queries`);

  // Step 2: Search with each expanded query
  const allResults: SearchResult[] = [];

  for (const eq of expandedQueries) {
    const results = await hybridSearch(eq, 10);
    allResults.push(...results);
  }

  // Step 3: Deduplicate by chunk ID
  const seen = new Set<string>();
  const uniqueResults = allResults.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  console.log(
    `📊 ${allResults.length} total results → ${uniqueResults.length} unique`
  );

  // Step 4: Rerank
  const reranked = await rerank(query, uniqueResults, 15);
  console.log(`🏆 Reranked to top ${reranked.length} results`);

  // Step 5: Trim to token budget
  let totalTokens = 0;
  const trimmedResults = reranked.filter((r) => {
    const tokens = Math.ceil(r.content.length / 4);
    if (totalTokens + tokens > MAX_CONTEXT_TOKENS) return false;
    totalTokens += tokens;
    return true;
  });

  return {
    query,
    expandedQueries,
    results: trimmedResults,
    totalTokens,
  };
}
