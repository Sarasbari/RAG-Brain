import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ─── Standalone query rewriter ────────────────────────────────────────────────
// Resolves pronouns and references from conversation history
// "what did they say about it?" → "What did the team say about the Q3 roadmap?"

export async function rewriteQuery(
  query: string,
  history: { role: string; content: string }[]
): Promise<string> {
  if (history.length === 0) return query   // no history, nothing to resolve

  const historyText = history
    .slice(-4)   // only last 4 turns to stay within context
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const res = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0,
    max_tokens: 100,
    messages: [
      {
        role: 'system',
        content:
          'Rewrite the user query to be fully self-contained using the conversation history. ' +
          'Replace all pronouns and references. Return ONLY the rewritten query, nothing else.',
      },
      {
        role: 'user',
        content: `History:\n${historyText}\n\nQuery: ${query}`,
      },
    ],
  })

  return res.choices[0].message.content?.trim() ?? query
}

// ─── HyDE — Hypothetical Document Embeddings ─────────────────────────────────
// Generate a fake ideal answer → embed it → use that vector to search
// The fake answer lives in the same vector space as real answers

export async function generateHypotheticalDocument(
  query: string
): Promise<string> {
  const res = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.3,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content:
          'You are a company knowledge base. Write a short, direct answer (2-3 sentences) ' +
          'to the question as if it were in an internal wiki page. ' +
          'Be specific and use technical language. Do not say you don\'t know.',
      },
      { role: 'user', content: query },
    ],
  })

  return res.choices[0].message.content?.trim() ?? query
}

// ─── Multi-query expansion ────────────────────────────────────────────────────
// Rephrase the query 3 ways → retrieve for each → deduplicate
// Dramatically improves recall for ambiguous questions

export async function expandQuery(query: string): Promise<string[]> {
  const res = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.5,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content:
          'Generate 3 different phrasings of the query for searching a company knowledge base. ' +
          'Each rephrasing should approach the question from a different angle. ' +
          'Return ONLY a JSON array of 3 strings, nothing else. Example: ["query1", "query2", "query3"]',
      },
      { role: 'user', content: query },
    ],
  })

  try {
    const text = res.choices[0].message.content?.trim() ?? '[]'
    const parsed = JSON.parse(text)
    return [query, ...parsed].slice(0, 4)   // original + 3 rephrasings
  } catch {
    return [query]   // fallback to original if parsing fails
  }
}