let voyageClient: { embed: (params: VoyageEmbedParams) => Promise<VoyageEmbedResponse> } | null = null;

interface VoyageEmbedParams {
  input: string | string[];
  model: string;
  input_type?: "document" | "query";
}

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[] }>;
  usage: { total_tokens: number };
}

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

export const VOYAGE_MODEL = "voyage-3";
export const VOYAGE_DIMENSION = 1024;

/**
 * Returns a lightweight Voyage AI client.
 * Voyage doesn't have an official JS SDK, so we wrap their REST API.
 */
export function getVoyageClient() {
  if (!voyageClient) {
    const apiKey = process.env.VOYAGE_API_KEY!;

    voyageClient = {
      async embed(params: VoyageEmbedParams): Promise<VoyageEmbedResponse> {
        const response = await fetch(VOYAGE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input: Array.isArray(params.input) ? params.input : [params.input],
            model: params.model,
            input_type: params.input_type ?? "document",
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Voyage AI error (${response.status}): ${error}`);
        }

        return response.json();
      },
    };
  }
  return voyageClient;
}
