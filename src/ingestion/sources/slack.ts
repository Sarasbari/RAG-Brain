import { WebClient } from '@slack/web-api'
import { RawDocument } from '@/types'

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

// ─── Resolve user IDs → display names (cached) ───────────────────────────────

const userCache = new Map<string, string>()

async function resolveUser(userId: string): Promise<string> {
  if (userCache.has(userId)) return userCache.get(userId)!

  try {
    const res = await slack.users.info({ user: userId })
    const name =
      res.user?.real_name ?? res.user?.name ?? userId
    userCache.set(userId, name)
    return name
  } catch {
    return userId
  }
}

// ─── Fetch messages + threads from one channel ───────────────────────────────

async function fetchChannel(
  channelId: string,
  since?: string
): Promise<RawDocument[]> {
  const documents: RawDocument[] = []

  // Get channel name for labelling
  let channelName = channelId
  try {
    const info = await slack.conversations.info({ channel: channelId })
    channelName = info.channel?.name ?? channelId
  } catch {}

  // Convert since ISO → Slack timestamp (Unix seconds)
  const oldest = since
    ? String(Math.floor(new Date(since).getTime() / 1000))
    : undefined

  // Paginate channel history
  let cursor: string | undefined
  const allMessages: any[] = []

  do {
    const res = await slack.conversations.history({
      channel: channelId,
      oldest,
      limit: 200,
      cursor,
    })

    const messages = (res.messages ?? []).filter(
      (m) => m.type === 'message' && !m.subtype && m.text?.trim()
    )

    allMessages.push(...messages)
    cursor = res.response_metadata?.next_cursor ?? undefined
  } while (cursor)

  // Group: standalone messages + their thread replies into one document
  for (const msg of allMessages) {
    const ts = msg.ts ?? ''
    const date = new Date(parseFloat(ts) * 1000).toISOString()
    const author = await resolveUser(msg.user ?? '')

    let content = `**${author}**: ${msg.text}\n`

    // Fetch thread replies if this message has them
    if (msg.reply_count && msg.reply_count > 0) {
      try {
        const thread = await slack.conversations.replies({
          channel: channelId,
          ts: msg.ts,
          limit: 100,
        })

        const replies = (thread.messages ?? []).slice(1) // skip parent
        for (const reply of replies) {
          const replyAuthor = await resolveUser(reply.user ?? '')
          content += `**${replyAuthor}**: ${reply.text}\n`
        }
      } catch {}
    }

    if (content.trim().length < 30) continue

    documents.push({
      id: `slack-${channelId}-${ts}`,
      sourceType: 'slack',
      sourceId: `${channelId}-${ts}`,
      title: `#${channelName} — ${new Date(date).toLocaleDateString()}`,
      content,
      url: `https://slack.com/app_redirect?channel=${channelId}&message_ts=${ts}`,
      lastModified: new Date(date),
      author,
      metadata: {},
    })
  }

  console.log(
    `  ✓ #${channelName}: ${documents.length} message threads`
  )
  return documents
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchSlackDocuments(
  since?: string
): Promise<RawDocument[]> {
  console.log('💬 Fetching Slack messages...')

  const channelIds = (process.env.SLACK_CHANNEL_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  const allDocuments: RawDocument[] = []

  for (const channelId of channelIds) {
    const docs = await fetchChannel(channelId, since)
    allDocuments.push(...docs)
  }

  console.log(`✅ Slack: ${allDocuments.length} threads fetched\n`)
  return allDocuments
}