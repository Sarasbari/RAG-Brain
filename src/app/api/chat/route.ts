import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/retrieval/retriever";
import { generateStreamingResponse, generateResponse } from "@/llm/generator";
import { getLangfuse, flushLangfuse } from "@/lib/langfuse";
import type { ChatRequest } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { messages, stream = true } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user") {
      return NextResponse.json(
        { error: "Last message must be from user" },
        { status: 400 }
      );
    }

    // Start Langfuse trace
    const langfuse = getLangfuse();
    const trace = langfuse.trace({
      name: "rag-chat",
      input: lastMessage.content,
    });

    // Step 1: Retrieve relevant context
    const retrievalSpan = trace.span({ name: "retrieval" });
    const context = await retrieve(lastMessage.content);
    retrievalSpan.end({
      output: {
        resultCount: context.results.length,
        totalTokens: context.totalTokens,
        expandedQueries: context.expandedQueries,
      },
    });

    // Step 2: Generate response
    const generationSpan = trace.span({ name: "generation" });

    if (stream) {
      const responseStream = await generateStreamingResponse(
        messages,
        context.results
      );

      generationSpan.end({ output: { streamed: true } });
      await flushLangfuse();

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Trace-Id": trace.id,
        },
      });
    }

    // Non-streaming response
    const responseText = await generateResponse(messages, context.results);
    generationSpan.end({ output: responseText });

    trace.update({ output: responseText });
    await flushLangfuse();

    return NextResponse.json({
      message: { role: "assistant", content: responseText },
      sources: context.results.map((r) => ({
        title: r.metadata.title,
        url: r.metadata.url,
        sourceType: r.metadata.sourceType,
        relevanceScore: r.rerankedScore,
      })),
      traceId: trace.id,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
