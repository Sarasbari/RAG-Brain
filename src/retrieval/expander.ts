import { getGroqClient, DEFAULT_MODEL } from "@/lib/groq";

/**
 * Expands the original query into multiple search queries
 * using query decomposition and HyDE (Hypothetical Document Embedding).
 */
export async function expandQuery(originalQuery: string): Promise<string[]> {
  const groq = getGroqClient();

  const response = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content: `You are a query expansion system for a knowledge base search engine.
Given a user query, generate 3 alternative search queries that capture different aspects of the question.
Also generate 1 hypothetical ideal answer passage (HyDE) that would perfectly answer the question.

Return ONLY a JSON object with this exact format:
{
  "queries": ["query1", "query2", "query3"],
  "hyde": "A hypothetical passage that would answer the original question..."
}`,
      },
      { role: "user", content: originalQuery },
    ],
    temperature: 0.3,
    max_tokens: 512,
  });

  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    const expanded: string[] = [originalQuery];

    if (Array.isArray(parsed.queries)) {
      expanded.push(...parsed.queries);
    }
    if (typeof parsed.hyde === "string" && parsed.hyde.length > 0) {
      expanded.push(parsed.hyde);
    }

    return expanded;
  } catch {
    console.warn("⚠️  Query expansion failed, using original query");
    return [originalQuery];
  }
}
