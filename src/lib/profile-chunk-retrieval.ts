import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimum cosine similarity (from `match_profile_chunks`: `1 - (embedding <=> query)`)
 * required for a chunk to count as evidence. Tune as needed:
 * - 0.2 = very permissive, distant relationships
 * - 0.3 = permissive
 * - 0.45 = stricter (default) — aims for strong themes ~3–5 chunks, weak ~1–3, none ~0–1
 * - 0.5 = very strict, obvious matches only
 * - 0.55+ = often too aggressive
 */
export const DEFAULT_PROFILE_CHUNK_MATCH_THRESHOLD = 0.45;

/**
 * Top-K profile chunk IDs by cosine similarity to `query_embedding` for a single user.
 * Chunks below the similarity threshold are excluded; result may be shorter than `limit` or empty.
 */
export async function matchNearestProfileChunkIds(
  supabase: SupabaseClient,
  userId: string,
  queryEmbedding: number[],
  limit: number,
  matchThreshold: number = DEFAULT_PROFILE_CHUNK_MATCH_THRESHOLD
): Promise<string[]> {
  const { data, error } = await supabase.rpc("match_profile_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: limit,
    filter_user_id: userId,
  });

  if (error) {
    console.error("[matchNearestProfileChunkIds] rpc error:", error);
    throw error;
  }

  return (data ?? []).map((row: { id: string }) => row.id);
}
