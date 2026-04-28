import { Langfuse } from 'langfuse'

export const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com',
  flushAt: 1,       // send immediately in serverless — no batching
  flushInterval: 0,
})

// Helper to safely flush without crashing if it fails
export async function flushLangfuse() {
  try {
    await langfuse.flushAsync()
  } catch (err) {
    console.warn('Langfuse flush failed:', err)
  }
}