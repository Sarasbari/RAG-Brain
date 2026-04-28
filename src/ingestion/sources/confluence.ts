import axios from 'axios'
import TurndownService from 'turndown'
import { RawDocument } from '@/types'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
})

const client = axios.create({
  baseURL: `${process.env.CONFLUENCE_BASE_URL}/wiki/rest/api`,
  auth: {
    username: process.env.CONFLUENCE_EMAIL!,
    password: process.env.CONFLUENCE_API_TOKEN!,
  },
  headers: { Accept: 'application/json' },
})

// ─── Fetch all spaces ─────────────────────────────────────────────────────────

async function fetchSpaces(): Promise<string[]> {
  const response = await client.get('/space', {
    params: { limit: 50, type: 'global' },
  })
  return response.data.results.map((s: any) => s.key)
}

// ─── Fetch all pages in a space ───────────────────────────────────────────────

async function fetchPagesInSpace(spaceKey: string): Promise<any[]> {
  const pages: any[] = []
  let start = 0
  const limit = 50

  while (true) {
    const response = await client.get('/content', {
      params: {
        spaceKey,
        type: 'page',
        status: 'current',
        expand: 'body.storage,history.lastUpdated,version,ancestors',
        start,
        limit,
      },
    })

    pages.push(...response.data.results)

    if (response.data.results.length < limit) break
    start += limit
  }

  return pages
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchConfluenceDocuments(
  since?: string
): Promise<RawDocument[]> {
  console.log('📄 Fetching Confluence pages...')

  const spaceKeys = await fetchSpaces()
  const documents: RawDocument[] = []

  for (const spaceKey of spaceKeys) {
    const pages = await fetchPagesInSpace(spaceKey)

    for (const page of pages) {
      const lastEdited = page.history?.lastUpdated?.when ?? 
        page.version?.when ?? new Date().toISOString()

      if (since && lastEdited <= since) continue

      const htmlContent = page.body?.storage?.value ?? ''
      if (!htmlContent.trim()) continue

      // Convert Confluence HTML storage format → clean markdown
      const markdown = turndown.turndown(htmlContent)

      if (markdown.trim().length < 50) continue

      const url = `${process.env.CONFLUENCE_BASE_URL}/wiki${page._links?.webui ?? ''}`
      const author = page.history?.lastUpdated?.by?.displayName ?? undefined

      documents.push({
        id: `confluence-${page.id}`,
        title: page.title,
        content: markdown,
        url,
        source: 'confluence',
        lastEditedAt: lastEdited,
        author,
      })

      console.log(`  ✓ [${spaceKey}] ${page.title}`)
    }
  }

  console.log(`✅ Confluence: ${documents.length} pages fetched\n`)
  return documents
}