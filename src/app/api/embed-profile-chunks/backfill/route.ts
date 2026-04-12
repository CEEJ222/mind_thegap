import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { embedAndUpdateProfileChunks } from "@/lib/embeddings";

/**
 * Service-role backfill: all `profile_chunks` with null `embedding` for a user.
 * POST { user_id: string }
 * Header: x-profile-embed-backfill-secret: PROFILE_EMBED_BACKFILL_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.PROFILE_EMBED_BACKFILL_SECRET?.trim();
    if (!secret) {
      return NextResponse.json({ error: "Not configured" }, { status: 404 });
    }

    const header = request.headers.get("x-profile-embed-backfill-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const user_id = body.user_id as string | undefined;
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: missing, error: fetchError } = await supabase
      .from("profile_chunks")
      .select("id, chunk_text")
      .eq("user_id", user_id)
      .is("embedding", null);

    if (fetchError) {
      console.error("[embed-profile-chunks/backfill] fetch:", fetchError);
      return NextResponse.json(
        { error: "Failed to load chunks" },
        { status: 500 }
      );
    }

    const rows = missing ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const BATCH = 200;
    let updated = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const result = await embedAndUpdateProfileChunks(supabase, slice);
      if (!result.ok) {
        console.error("[embed-profile-chunks/backfill] batch failed:", result.error);
        return NextResponse.json(
          { error: result.error || "Embedding failed", updated },
          { status: 502 }
        );
      }
      updated += slice.length;
    }

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error("[embed-profile-chunks/backfill] error:", err);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
