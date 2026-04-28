import { Client } from "@notionhq/client";
import type { RawDocument } from "@/types";

let notion: Client | null = null;

function getNotionClient(): Client {
  if (!notion) {
    notion = new Client({ auth: process.env.NOTION_API_KEY! });
  }
  return notion;
}

/**
 * Fetches all pages from the configured Notion workspace.
 * Uses the Notion search API to discover pages, then retrieves
 * their block content as plain text.
 */
export async function fetchNotionDocuments(
  cursor?: string
): Promise<{ documents: RawDocument[]; nextCursor?: string }> {
  const client = getNotionClient();
  const documents: RawDocument[] = [];

  const response = await client.search({
    filter: { property: "object", value: "page" },
    start_cursor: cursor,
    page_size: 100,
  });

  for (const page of response.results) {
    if (page.object !== "page" || !("properties" in page)) continue;

    const blocks = await fetchPageBlocks(client, page.id);
    const content = blocksToText(blocks);
    const title = extractTitle(page);

    if (!content.trim()) continue;

    documents.push({
      id: `notion-${page.id}`,
      sourceType: "notion",
      sourceId: page.id,
      title,
      content,
      url: (page as Record<string, unknown>).url as string | undefined,
      lastModified: new Date(page.last_edited_time),
      metadata: {
        createdTime: page.created_time,
        parentType: (page as Record<string, unknown>).parent
          ? ((page as Record<string, unknown>).parent as Record<string, unknown>).type
          : undefined,
      },
    });
  }

  return {
    documents,
    nextCursor: response.has_more ? response.next_cursor ?? undefined : undefined,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

async function fetchPageBlocks(
  client: Client,
  pageId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return blocks;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blocksToText(blocks: any[]): string {
  return blocks
    .map((block) => {
      const type = block.type;
      const content = block[type];
      if (!content?.rich_text) return "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return content.rich_text.map((t: any) => t.plain_text).join("");
    })
    .filter(Boolean)
    .join("\n\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTitle(page: any): string {
  const properties = page.properties;
  for (const key of Object.keys(properties)) {
    const prop = properties[key];
    if (prop.type === "title" && prop.title?.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return prop.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "Untitled";
}
