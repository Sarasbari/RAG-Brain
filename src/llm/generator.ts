import { getGroqClient, DEFAULT_MODEL, MAX_TOKENS, TEMPERATURE } from "@/lib/groq";
import { buildRagPrompt } from "./prompts";
import type { ChatMessage, RerankedResult } from "@/types";

/**
 * Generates a streaming RAG response using Groq.
 * Returns a ReadableStream for the SSE response.
 */
export async function generateStreamingResponse(
  messages: ChatMessage[],
  context: RerankedResult[]
): Promise<ReadableStream<Uint8Array>> {
  const groq = getGroqClient();
  const systemPrompt = buildRagPrompt(context);

  const stream = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    stream: true,
  });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            const sseData = `data: ${JSON.stringify({ content })}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        }

        // Send sources metadata at the end
        const sourcesData = `data: ${JSON.stringify({
          sources: context.map((r) => ({
            title: r.metadata.title,
            url: r.metadata.url,
            sourceType: r.metadata.sourceType,
            relevanceScore: r.rerankedScore,
          })),
          done: true,
        })}\n\n`;
        controller.enqueue(encoder.encode(sourcesData));

        controller.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        const errorData = `data: ${JSON.stringify({ error: errorMsg })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
        controller.close();
      }
    },
  });
}

/**
 * Generates a non-streaming RAG response.
 */
export async function generateResponse(
  messages: ChatMessage[],
  context: RerankedResult[]
): Promise<string> {
  const groq = getGroqClient();
  const systemPrompt = buildRagPrompt(context);

  const response = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
  });

  return response.choices[0]?.message?.content ?? "";
}
