import type { RerankedResult } from "@/types";

export const SYSTEM_PROMPT = `You are RAG-Brain, an intelligent knowledge assistant powered by retrieved context from your organization's knowledge base (Notion, Confluence, and Slack).

## Core Behavior
- Answer questions accurately using ONLY the provided context
- If the context doesn't contain enough information, say so honestly
- Cite your sources by referencing the document title and source type
- Use clear, professional language

## Formatting
- Use markdown for structured responses
- Use bullet points for lists
- Use code blocks for technical content
- Keep responses concise but thorough

## Citation Format
When referencing information, use inline citations like: [Source Title](url) or mention the source type (Notion/Confluence/Slack).`;

/**
 * Builds the RAG prompt by injecting retrieved context into the system message.
 */
export function buildRagPrompt(context: RerankedResult[]): string {
  if (context.length === 0) {
    return `${SYSTEM_PROMPT}

## Retrieved Context
No relevant documents were found in the knowledge base. Let the user know and suggest they refine their question.`;
  }

  const contextBlocks = context
    .map((result, i) => {
      const source = `[${result.metadata.sourceType.toUpperCase()}] ${result.metadata.title}`;
      const url = result.metadata.url ? ` (${result.metadata.url})` : "";
      return `### Source ${i + 1}: ${source}${url}
Relevance: ${(result.rerankedScore * 100).toFixed(0)}%

${result.content}`;
    })
    .join("\n\n---\n\n");

  return `${SYSTEM_PROMPT}

## Retrieved Context
The following documents were retrieved from the knowledge base, ordered by relevance:

${contextBlocks}

## Instructions
Answer the user's question using the above context. Always cite which source(s) you used.`;
}
