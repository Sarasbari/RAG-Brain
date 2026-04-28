import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/ingestion/pipeline";
import type { SourceType } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large syncs

const VALID_SOURCES: SourceType[] = ["notion", "confluence", "slack"];

/**
 * POST /api/sync
 * Triggers a manual data sync for specified sources.
 *
 * Body: { sources?: ["notion", "confluence", "slack"] }
 * If no sources specified, syncs all.
 */
export async function POST(request: NextRequest) {
  try {
    // Simple API key auth for sync endpoint
    const authHeader = request.headers.get("authorization");
    const expectedKey = process.env.SYNC_API_KEY;

    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sources: SourceType[] = Array.isArray(body.sources)
      ? body.sources.filter((s: string) => VALID_SOURCES.includes(s as SourceType))
      : VALID_SOURCES;

    console.log(`🔄 Manual sync triggered for: ${sources.join(", ")}`);

    const results = await runPipeline(sources);

    const summary = results.map((r) => ({
      source: r.sourceType,
      documents: r.documentsProcessed,
      chunks: r.chunksCreated,
      embeddings: r.embeddingsGenerated,
      duration: `${(r.duration / 1000).toFixed(1)}s`,
      errors: r.errors,
    }));

    return NextResponse.json({
      success: true,
      results: summary,
    });
  } catch (error) {
    console.error("Sync API error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}
