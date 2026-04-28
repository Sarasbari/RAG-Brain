import type { RawDocument } from "@/types";

const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL!;
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL!;
const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN!;

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64")}`;
}

/**
 * Fetches pages from Confluence Cloud using the REST API.
 * Retrieves body content in "storage" format and strips HTML.
 */
export async function fetchConfluenceDocuments(
  cursor?: string
): Promise<{ documents: RawDocument[]; nextCursor?: string }> {
  const documents: RawDocument[] = [];
  const start = cursor ? parseInt(cursor, 10) : 0;
  const limit = 50;

  const url = new URL(`${CONFLUENCE_BASE_URL}/wiki/rest/api/content`);
  url.searchParams.set("start", String(start));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("expand", "body.storage,version,space");
  url.searchParams.set("type", "page");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Confluence API error (${response.status}): ${await response.text()}`
    );
  }

  const data = await response.json();

  for (const page of data.results) {
    const content = stripHtml(page.body?.storage?.value ?? "");
    if (!content.trim()) continue;

    documents.push({
      id: `confluence-${page.id}`,
      sourceType: "confluence",
      sourceId: page.id,
      title: page.title,
      content,
      url: `${CONFLUENCE_BASE_URL}/wiki${page._links?.webui ?? ""}`,
      author: page.version?.by?.displayName,
      lastModified: new Date(page.version?.when ?? Date.now()),
      metadata: {
        spaceKey: page.space?.key,
        spaceName: page.space?.name,
        version: page.version?.number,
      },
    });
  }

  const hasMore = data.size + start < (data.totalSize ?? 0);

  return {
    documents,
    nextCursor: hasMore ? String(start + limit) : undefined,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
