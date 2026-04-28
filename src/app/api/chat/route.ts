import { NextRequest } from 'next/server'
import { retrieve } from '@/retrieval/retriever'
import { generateStreamingAnswer } from '@/llm/generator'
import { extractCitations } from '@/llm/prompts'
import { langfuse, flushLangfuse } from '@/lib/langfuse'
import { db } from '@/db/client'
import { queryLog } from '@/db/schema'
import { ChatMessage } from '@/types'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  const queryId = randomUUID()

  const body = await req.json()
  const {
    query,
    history = [],
    sourceFilter,
  }: {
    query: string
    history: ChatMessage[]
    sourceFilter?: ('notion' | 'confluence' | 'slack')[]
  } = body

  if (!query?.trim()) {
    return new Response('Query is required', { status: 400 })
  }

  // ── Start Langfuse trace ────────────────────────────────────────────────────
  const trace = langfuse.trace({
    id: queryId,
    name: 'rag-query',
    input: query,
    metadata: { sourceFilter, historyLength: history.length },
  })

  try {
    // ── Span: Retrieval ───────────────────────────────────────────────────────
    const retrievalSpan = trace.span({
      name: 'retrieval',
      input: { query, sourceFilter },
    })

    const chunks = await retrieve(query, history, {
      sourceFilter,
      useHyDE: true,
      useMultiQuery: true,
      useRerank: true,
    })

    retrievalSpan.end({
      output: {
        chunksRetrieved: chunks.length,
        sources: [...new Set(chunks.map((c) => c.metadata.source))],
        topScore: chunks[0]?.score,
        titles: chunks.map((c) => c.metadata.title),
      },
    })

    const citations = extractCitations(chunks)

    // ── Span: LLM Generation ──────────────────────────────────────────────────
    const generationSpan = trace.generation({
      name: 'llm-generation',
      model: 'llama-3.3-70b-versatile',
      input: { query, chunksInContext: chunks.length },
    })

    const stream = generateStreamingAnswer(query, chunks, history)
    const response = stream.toDataStreamResponse()

    // Collect full response text for Langfuse (async, doesn't block stream)
    let fullResponse = ''
    const [streamForClient, streamForLogging] = response.body!.tee()

    // Log to DB
    const responseTimeMs = Date.now() - startTime
    db.insert(queryLog)
      .values({
        id: queryId,
        query,
        chunksRetrieved: chunks.length,
        sources: [...new Set(chunks.map((c) => c.metadata.source))],
        responseTimeMs,
        langfuseTraceId: queryId,
      })
      .catch(console.warn)   // non-blocking

    // End generation span + trace after stream completes (non-blocking)
    ;(async () => {
      const reader = streamForLogging.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try { fullResponse += JSON.parse(line.slice(2)) } catch {}
          }
        }
      }

      generationSpan.end({ output: fullResponse })
      trace.update({ output: fullResponse })
      await flushLangfuse()
    })()

    const headers = new Headers(response.headers)
    headers.set('X-Citations', JSON.stringify(citations))
    headers.set('X-Query-Id', queryId)
    headers.set('Access-Control-Expose-Headers', 'X-Citations, X-Query-Id')

    return new Response(streamForClient, {
      status: response.status,
      headers,
    })
  } catch (err) {
    trace.update({ output: `Error: ${(err as Error).message}` })
    await flushLangfuse()
    console.error('Chat API error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}