import { NextRequest, NextResponse } from 'next/server'
import { runPipeline } from '@/ingestion/pipeline'

// Vercel Cron calls this with a secret header
// Configure in vercel.json below

export const runtime = 'nodejs'
export const maxDuration = 300   // 5 min max for sync

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron or an admin
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const source = req.nextUrl.searchParams.get('source') as any
  const sources = source ? [source] : ['notion', 'confluence', 'slack']

  try {
    await runPipeline({
      sources,
      incremental: true,   // auto-reads last sync time from DB
    })

    return NextResponse.json({
      ok: true,
      message: `Sync complete for: ${sources.join(', ')}`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}