const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const MODEL = 'voyage-3-lite'

export async function embedQuery(query: string): Promise<number[]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [query],
      model: MODEL,
      input_type: 'query',    // ← different from 'document' at ingest time
    }),
  })

  if (!res.ok) throw new Error(`Voyage AI error: ${await res.text()}`)

  const data = await res.json()
  return data.data[0].embedding
}