import 'dotenv/config'
import { retrieve } from '../src/retrieval/retriever'

const query = process.argv[2] ?? 'what is our onboarding process?'

retrieve(query, []).then((chunks) => {
  console.log(`\n📋 Top ${chunks.length} results for: "${query}"\n`)
  chunks.forEach((c, i) => {
    console.log(`── [${i + 1}] Score: ${c.score.toFixed(3)} | ${c.metadata.source} | ${c.metadata.title}`)
    console.log(`   ${c.content.slice(0, 150)}...\n`)
  })
})