import { createGroq } from '@ai-sdk/groq'
import { streamText } from 'ai'
import { buildSystemPrompt, buildUserPrompt } from './prompts'
import { RetrievedChunk, ChatMessage } from '@/types'

const groqProvider = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

export function generateStreamingAnswer(
  query: string,
  chunks: RetrievedChunk[],
  history: ChatMessage[]
) {
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(query, chunks)

  // Convert chat history to Vercel AI SDK format
  const historyMessages = history.slice(-6).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  return streamText({
    model: groqProvider('llama-3.3-70b-versatile'),
    system: systemPrompt,
    messages: [
      ...historyMessages,
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,      // low temp = more faithful to context
    maxTokens: 1024,
  })
}