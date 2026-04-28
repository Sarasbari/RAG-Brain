import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { RawDocument, Chunk } from '@/types'
import { v4 as uuid } from 'uuid'

// Install uuid: npm install uuid @types/uuid

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1024,      // tokens ≈ chars / 4 — 1024 chars ≈ 256 tokens
  chunkOverlap: 128,    // 12.5% overlap to avoid cutting context at boundaries
  separators: [
    '\n## ', '\n### ', '\n#### ',  // prefer splitting at headings
    '\n\n',                         // then paragraphs
    '\n',                           // then lines
    ' ',                            // then words
    '',                             // last resort: chars
  ],
})

export async function chunkDocuments(
  documents: RawDocument[]
): Promise<Chunk[]> {
  console.log(`✂️  Chunking ${documents.length} documents...`)

  const chunks: Chunk[] = []

  for (const doc of documents) {
    const texts = await splitter.splitText(doc.content)

    texts.forEach((text, index) => {
      chunks.push({
        id: `${doc.id}-chunk-${index}`,
        docId: doc.id,
        content: text,
        metadata: {
          title: doc.title,
          url: doc.url,
          source: doc.source,
          author: doc.author,
          lastEditedAt: doc.lastEditedAt,
          chunkIndex: index,
        },
      })
    })
  }

  console.log(`✅ Created ${chunks.length} chunks\n`)
  return chunks
}