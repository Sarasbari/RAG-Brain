import { Client } from '@notionhq/client'
import {
  PageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'
import { RawDocument } from '@/types'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

// ─── Block → Markdown ────────────────────────────────────────────────────────

function blockToMarkdown(block: BlockObjectResponse): string {
  const b = block as any

  switch (block.type) {
    case 'paragraph':
      return extractRichText(b.paragraph.rich_text) + '\n\n'
    case 'heading_1':
      return `# ${extractRichText(b.heading_1.rich_text)}\n\n`
    case 'heading_2':
      return `## ${extractRichText(b.heading_2.rich_text)}\n\n`
    case 'heading_3':
      return `### ${extractRichText(b.heading_3.rich_text)}\n\n`
    case 'bulleted_list_item':
      return `- ${extractRichText(b.bulleted_list_item.rich_text)}\n`
    case 'numbered_list_item':
      return `1. ${extractRichText(b.numbered_list_item.rich_text)}\n`
    case 'to_do':
      const checked = b.to_do.checked ? '[x]' : '[ ]'
      return `- ${checked} ${extractRichText(b.to_do.rich_text)}\n`
    case 'toggle':
      return extractRichText(b.toggle.rich_text) + '\n\n'
    case 'code':
      const lang = b.code.language || ''
      return `\`\`\`${lang}\n${extractRichText(b.code.rich_text)}\n\`\`\`\n\n`
    case 'quote':
      return `> ${extractRichText(b.quote.rich_text)}\n\n`
    case 'callout':
      return `> ${extractRichText(b.callout.rich_text)}\n\n`
    case 'divider':
      return `---\n\n`
    case 'table_of_contents':
      return ''
    default:
      return ''
  }
}

function extractRichText(richText: any[]): string {
  if (!richText) return ''
  return richText.map((t) => t.plain_text).join('')
}

// ─── Fetch all blocks recursively (handles nested toggles etc.) ──────────────

async function fetchBlocks(blockId: string): Promise<string> {
  let markdown = ''
  let cursor: string | undefined

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const block of response.results as BlockObjectResponse[]) {
      markdown += blockToMarkdown(block)

      // Recurse into children (nested toggles, synced blocks, etc.)
      if ((block as any).has_children) {
        markdown += await fetchBlocks(block.id)
      }
    }

    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return markdown
}

// ─── Fetch all pages recursively via search ──────────────────────────────────

async function fetchAllPages(): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = []
  let cursor: string | undefined

  do {
    const response = await notion.search({
      filter: { property: 'object', value: 'page' },
      start_cursor: cursor,
      page_size: 100,
    })

    for (const result of response.results) {
      if (result.object === 'page') {
        pages.push(result as PageObjectResponse)
      }
    }

    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return pages
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function fetchNotionDocuments(
  since?: string   // ISO string — only fetch pages edited after this date
): Promise<RawDocument[]> {
  console.log('📄 Fetching Notion pages...')
  const pages = await fetchAllPages()

  const documents: RawDocument[] = []

  for (const page of pages) {
    // Skip if not edited since last sync
    if (since && page.last_edited_time <= since) continue

    const props = page.properties as any

    // Extract title — Notion stores it differently per page type
    const titleProp =
      props.title ?? props.Name ?? props.name ??
      Object.values(props).find((p: any) => p.type === 'title')

    const title = titleProp?.title
      ?.map((t: any) => t.plain_text)
      .join('') ?? 'Untitled'

    const url = (page as any).url ?? 
      `https://notion.so/${page.id.replace(/-/g, '')}`

    const author =
      page.created_by?.id ?? undefined

    try {
      const content = await fetchBlocks(page.id)

      // Skip empty pages
      if (content.trim().length < 50) continue

      documents.push({
        id: `notion-${page.id}`,
        title,
        content,
        url,
        source: 'notion',
        lastEditedAt: page.last_edited_time,
        author,
      })

      console.log(`  ✓ ${title}`)
    } catch (err) {
      console.warn(`  ✗ Skipped page ${title} — ${(err as Error).message}`)
    }
  }

  console.log(`✅ Notion: ${documents.length} pages fetched\n`)
  return documents
}