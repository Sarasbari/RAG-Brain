/**
 * CLI: npx tsx scripts/ingest.ts [--source notion|confluence|slack]
 *
 * Runs the ingestion pipeline from the command line.
 * Requires .env.local to be loaded (tsx handles this automatically).
 */

import "dotenv/config";
import { runPipeline } from "../src/ingestion/pipeline";
import type { SourceType } from "../src/types";

const VALID_SOURCES: SourceType[] = ["notion", "confluence", "slack"];

async function main() {
  const args = process.argv.slice(2);
  let sources: SourceType[] = VALID_SOURCES;

  // Parse --source flag
  const sourceIndex = args.indexOf("--source");
  if (sourceIndex !== -1 && args[sourceIndex + 1]) {
    const requested = args[sourceIndex + 1] as SourceType;
    if (VALID_SOURCES.includes(requested)) {
      sources = [requested];
    } else {
      console.error(`❌ Invalid source: ${requested}`);
      console.error(`   Valid sources: ${VALID_SOURCES.join(", ")}`);
      process.exit(1);
    }
  }

  console.log("🧠 RAG-Brain Ingestion Pipeline");
  console.log(`   Sources: ${sources.join(", ")}`);
  console.log("─".repeat(50));

  const results = await runPipeline(sources);

  console.log("\n" + "─".repeat(50));
  console.log("📊 Summary:");

  for (const result of results) {
    const status = result.errors.length > 0 ? "❌" : "✅";
    console.log(
      `   ${status} ${result.sourceType}: ${result.documentsProcessed} docs → ${result.chunksCreated} chunks → ${result.embeddingsGenerated} embeddings (${(result.duration / 1000).toFixed(1)}s)`
    );
    for (const err of result.errors) {
      console.log(`      Error: ${err}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
