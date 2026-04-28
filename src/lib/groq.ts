import Groq from "groq-sdk";

let client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!client) {
    client = new Groq({
      apiKey: process.env.GROQ_API_KEY!,
    });
  }
  return client;
}

export const DEFAULT_MODEL = "llama-3.3-70b-versatile";
export const MAX_TOKENS = 4096;
export const TEMPERATURE = 0.1;
