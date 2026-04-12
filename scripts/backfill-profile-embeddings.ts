/**
 * Backfill `profile_chunks.embedding` for rows where it is null.
 * Usage (from repo root, with env loaded):
 *   npx tsx --env-file=.env.local scripts/backfill-profile-embeddings.ts [user_uuid]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { embedAndUpdateProfileChunks } from "../src/lib/embeddings";

const DEFAULT_USER = "ce7bd1f8-44b3-46ab-b929-18ddbb82098c";

async function main() {
  const userId = process.argv[2]?.trim() || DEFAULT_USER;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from("profile_chunks")
    .select("id, chunk_text")
    .eq("user_id", userId)
    .is("embedding", null);

  if (error) {
    console.error("Failed to fetch chunks:", error);
    process.exit(1);
  }

  const list = rows ?? [];
  console.log(`Found ${list.length} chunks with null embedding for user ${userId}`);

  const BATCH = 200;
  for (let i = 0; i < list.length; i += BATCH) {
    const slice = list.slice(i, i + BATCH);
    const result = await embedAndUpdateProfileChunks(supabase, slice);
    if (!result.ok) {
      console.error("Embedding batch failed:", result.error);
      process.exit(1);
    }
    console.log(`Embedded ${Math.min(i + BATCH, list.length)} / ${list.length}`);
  }

  console.log("Backfill complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
