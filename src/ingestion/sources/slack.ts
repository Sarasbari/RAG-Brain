import { WebClient } from "@slack/web-api";
import type { RawDocument } from "@/types";

let slack: WebClient | null = null;

function getSlackClient(): WebClient {
  if (!slack) {
    slack = new WebClient(process.env.SLACK_BOT_TOKEN!);
  }
  return slack;
}

/**
 * Fetches messages from configured Slack channels.
 * Groups consecutive messages into logical "documents" by thread
 * or time window (5-minute gap = new document).
 */
export async function fetchSlackDocuments(
  cursor?: string
): Promise<{ documents: RawDocument[]; nextCursor?: string }> {
  const client = getSlackClient();
  const documents: RawDocument[] = [];
  const channelIds = (process.env.SLACK_CHANNEL_IDS ?? "").split(",").filter(Boolean);

  if (channelIds.length === 0) {
    console.warn("⚠️  No SLACK_CHANNEL_IDS configured, skipping Slack sync");
    return { documents };
  }

  for (const channelId of channelIds) {
    const channelDocs = await fetchChannelMessages(client, channelId.trim(), cursor);
    documents.push(...channelDocs.documents);
  }

  return { documents };
}

// ─── Internal ──────────────────────────────────────────────────────

async function fetchChannelMessages(
  client: WebClient,
  channelId: string,
  cursor?: string
): Promise<{ documents: RawDocument[] }> {
  const documents: RawDocument[] = [];

  const result = await client.conversations.history({
    channel: channelId,
    cursor,
    limit: 200,
    oldest: getOldestTimestamp(),
  });

  if (!result.messages) return { documents };

  // Get channel name for metadata
  let channelName = channelId;
  try {
    const info = await client.conversations.info({ channel: channelId });
    channelName = info.channel?.name ?? channelId;
  } catch {
    // Fallback to ID
  }

  // Group messages by thread or 5-min gap
  const groups = groupMessages(result.messages);

  for (const group of groups) {
    const content = group
      .map((msg) => msg.text ?? "")
      .filter(Boolean)
      .join("\n\n");

    if (!content.trim() || content.length < 50) continue;

    const firstMsg = group[0];
    const ts = firstMsg.ts ?? String(Date.now() / 1000);

    documents.push({
      id: `slack-${channelId}-${ts}`,
      sourceType: "slack",
      sourceId: `${channelId}:${ts}`,
      title: `#${channelName} — ${new Date(parseFloat(ts) * 1000).toLocaleDateString()}`,
      content,
      author: firstMsg.user,
      lastModified: new Date(parseFloat(ts) * 1000),
      metadata: {
        channelId,
        channelName,
        threadTs: firstMsg.thread_ts,
        messageCount: group.length,
      },
    });
  }

  return { documents };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupMessages(messages: any[]): any[][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentGroup: any[] = [];
  const GAP_SECONDS = 300; // 5 minutes

  // Messages come in reverse chronological order
  const sorted = [...messages].reverse();

  for (const msg of sorted) {
    if (msg.subtype) continue; // Skip system messages

    if (currentGroup.length === 0) {
      currentGroup.push(msg);
      continue;
    }

    const lastTs = parseFloat(currentGroup[currentGroup.length - 1].ts);
    const thisTs = parseFloat(msg.ts);

    if (thisTs - lastTs > GAP_SECONDS || msg.thread_ts) {
      groups.push(currentGroup);
      currentGroup = [msg];
    } else {
      currentGroup.push(msg);
    }
  }

  if (currentGroup.length > 0) groups.push(currentGroup);
  return groups;
}

function getOldestTimestamp(): string {
  // Default: fetch last 30 days of messages
  const thirtyDaysAgo = Date.now() / 1000 - 30 * 24 * 60 * 60;
  return String(thirtyDaysAgo);
}
