import Groq from 'groq-sdk'

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export const MODELS = {
  fast: 'llama-3.1-8b-instant',      // low latency, good for query rewriting
  quality: 'llama-3.3-70b-versatile', // best quality, use for final answer
} as const