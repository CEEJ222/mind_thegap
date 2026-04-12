import type { SupabaseClient } from "@supabase/supabase-js";

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

/** Must match `extensions.vector(1536)` on `profile_chunks.embedding`. */
export const PROFILE_CHUNK_EMBEDDING_DIMENSIONS = 1536;

function envEmbeddingModel(): string {
  const v = process.env.OPENROUTER_EMBEDDING_MODEL?.trim();
  return v || "openai/text-embedding-3-small";
}

/** Max inputs per OpenRouter embeddings request (stay under provider limits). */
const EMBED_BATCH_SIZE = 64;

interface OpenRouterEmbeddingsResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

/**
 * Create embedding vectors for non-empty texts via OpenRouter (OpenAI-compatible embeddings API).
 * Preserves order; skips empty strings (does not return a row for them — use only with parallel id lists).
 */
export async function createEmbeddingsForTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set (required for embeddings)");
  }

  const model = envEmbeddingModel();
  const out: number[][] = [];

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const slice = texts.slice(offset, offset + EMBED_BATCH_SIZE);
    const inputs = slice.map((t) => (t.trim().length === 0 ? " " : t.trim()));

    const res = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:3000",
        "X-Title": "Mind the App",
      },
      body: JSON.stringify({
        model,
        input: inputs,
        encoding_format: "float",
      }),
    });

    const raw = (await res.json()) as OpenRouterEmbeddingsResponse & Record<string, unknown>;

    if (!res.ok) {
      const msg =
        typeof raw.error === "object" && raw.error && "message" in raw.error
          ? String((raw.error as { message?: string }).message)
          : JSON.stringify(raw);
      throw new Error(`OpenRouter embeddings error ${res.status}: ${msg}`);
    }

    const data = raw.data;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("OpenRouter embeddings returned no data array");
    }

    const sorted = [...data].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0)
    );

    for (const row of sorted) {
      const emb = row.embedding;
      if (!Array.isArray(emb) || emb.length === 0) {
        throw new Error("OpenRouter embeddings returned an empty vector");
      }
      if (emb.length !== PROFILE_CHUNK_EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding dimension mismatch: got ${emb.length}, expected ${PROFILE_CHUNK_EMBEDDING_DIMENSIONS}. Set OPENROUTER_EMBEDDING_MODEL to a ${PROFILE_CHUNK_EMBEDDING_DIMENSIONS}-dim model or adjust the DB.`
        );
      }
      out.push(emb);
    }
  }

  return out;
}

export type ProfileChunkEmbedRow = { id: string; chunk_text: string };

/**
 * Generates embeddings for the given rows and writes them to `profile_chunks.embedding`.
 * Rows with empty `chunk_text` are skipped (no update).
 */
export async function embedAndUpdateProfileChunks(
  supabase: SupabaseClient,
  rows: ProfileChunkEmbedRow[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const valid = rows.filter((r) => r.chunk_text && r.chunk_text.trim().length > 0);
  if (valid.length === 0) return { ok: true };

  try {
    const texts = valid.map((r) => r.chunk_text.trim());
    const vectors = await createEmbeddingsForTexts(texts);

    if (vectors.length !== valid.length) {
      const msg = `Embedding count mismatch: ${vectors.length} vectors for ${valid.length} chunks`;
      console.error("[embeddings]", msg);
      return { ok: false, error: msg };
    }

    const updates = valid.map((row, i) =>
      supabase
        .from("profile_chunks")
        .update({ embedding: vectors[i] })
        .eq("id", row.id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("[embeddings] Supabase update failed:", failed.error);
      return { ok: false, error: failed.error.message };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[embeddings] embedAndUpdateProfileChunks failed:", e);
    return { ok: false, error: msg };
  }
}
