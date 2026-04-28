import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { queryLog } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { langfuse } from '@/lib/langfuse'

export async function POST(req: NextRequest) {
  const { queryId, thumbsUp } = await req.json()

  if (!queryId) {
    return NextResponse.json({ error: 'queryId required' }, { status: 400 })
  }

  // Update DB
  await db
    .update(queryLog)
    .set({ thumbsUp })
    .where(eq(queryLog.id, queryId))

  // Send to Langfuse as a score — shows up in dashboard
  langfuse.score({
    traceId: queryId,
    name: 'user-feedback',
    value: thumbsUp ? 1 : 0,
    comment: thumbsUp ? 'thumbs up' : 'thumbs down',
  })

  return NextResponse.json({ ok: true })
}