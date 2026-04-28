import { getGroqClient, DEFAULT_MODEL } from "@/lib/groq";
import type { SearchResult, RerankedResult } from "@/types";

/**
 * Reranks search results using LLM-based relevance scoring.
 * Uses Groq for fast inference. Falls back to original scores on error.
 */
export async function rerank(
  query: string,
  results: SearchResult[],
  topK: number = 10
): Promise<RerankedResult[]> {
  if (results.length === 0) return [];
  if (results.length <= topK) {
    return results.map((r) => ({
      ...r,
      originalScore: r.score,
      rerankedScore: r.score,
    }));
  }

  try {
    const groq = getGroqClient();

    // Score each result for relevance using the LLM
    const scoringPrompt = buildScoringPrompt(query, results);

    const response = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a relevance scoring system. Given a query and document passages, rate each passage's relevance from 0.0 to 1.0. Return ONLY a JSON array of numbers, one score per passage, in the same order.",
        },
        { role: "user", content: scoringPrompt },
      ],
      temperature: 0,
      max_tokens: 512,
    });

    const scoresText = response.choices[0]?.message?.content ?? "[]";
    const scores: number[] = JSON.parse(scoresText);

    // Combine with original results
    const reranked: RerankedResult[] = results.map((result, i) => ({
      ...result,
      originalScore: result.score,
      rerankedScore: scores[i] ?? result.score,
    }));

    // Sort by reranked score and take top K
    return reranked
      .sort((a, b) => b.rerankedScore - a.rerankedScore)
      .slice(0, topK);
  } catch (error) {
    console.warn("⚠️  Reranking failed, using original scores:", error);
    return results.slice(0, topK).map((r) => ({
      ...r,
      originalScore: r.score,
      rerankedScore: r.score,
    }));
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function buildScoringPrompt(query: string, results: SearchResult[]): string {
  const passages = results
    .map(
      (r, i) =>
        `[Passage ${i + 1}] (source: ${r.metadata.title})\n${r.content.slice(0, 300)}`
    )
    .join("\n\n");

  return `Query: "${query}"\n\nPassages:\n${passages}\n\nReturn a JSON array of ${results.length} relevance scores (0.0–1.0):`;
}
