import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedAndUpdateProfileChunks } from "@/lib/embeddings";

const MAX_CHUNK_IDS = 200;

/**
 * POST { chunk_ids: string[] }
 * Authenticated users only; chunks must belong to the caller.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const chunk_ids = body.chunk_ids as string[] | undefined;

    if (!Array.isArray(chunk_ids) || chunk_ids.length === 0) {
      return NextResponse.json(
        { error: "chunk_ids must be a non-empty array" },
        { status: 400 }
      );
    }

    if (chunk_ids.length > MAX_CHUNK_IDS) {
      return NextResponse.json(
        { error: `At most ${MAX_CHUNK_IDS} chunk_ids per request` },
        { status: 400 }
      );
    }

    const uniqueIds = Array.from(new Set(chunk_ids));

    const { data: rows, error: fetchError } = await supabase
      .from("profile_chunks")
      .select("id, chunk_text, user_id")
      .in("id", uniqueIds);

    if (fetchError) {
      console.error("[embed-profile-chunks] fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to load chunks" },
        { status: 500 }
      );
    }

    const owned = (rows ?? []).filter((r) => r.user_id === user.id);
    if (owned.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more chunks not found or not owned" },
        { status: 403 }
      );
    }

    const result = await embedAndUpdateProfileChunks(supabase, owned);

    if (!result.ok) {
      console.error("[embed-profile-chunks] embed failed:", result.error);
      return NextResponse.json(
        { error: result.error || "Embedding failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[embed-profile-chunks] error:", err);
    return NextResponse.json({ error: "Embedding request failed" }, { status: 500 });
  }
}
