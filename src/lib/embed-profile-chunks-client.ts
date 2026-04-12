/**
 * Browser helper: request server-side embedding for profile chunk rows after insert/update.
 * Requires an authenticated Supabase session (cookies).
 */
export async function requestEmbedProfileChunkIds(
  chunkIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unique = Array.from(new Set(chunkIds)).filter(Boolean);
  if (unique.length === 0) return { ok: true };

  try {
    const res = await fetch("/api/embed-profile-chunks", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunk_ids: unique }),
    });

    const data = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      const msg = data.error || `HTTP ${res.status}`;
      console.error("[requestEmbedProfileChunkIds]", msg);
      return { ok: false, error: msg };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[requestEmbedProfileChunkIds]", e);
    return { ok: false, error: msg };
  }
}
