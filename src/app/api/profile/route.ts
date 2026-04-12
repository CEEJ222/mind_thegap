import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuthedUser } from "@/lib/api-auth";

/**
 * GET /api/profile — lightweight identity + profile-readiness probe used by
 * the Mind the App Chrome extension to (a) verify its stored Bearer token
 * is still valid and (b) decide whether to gate analyze/generate with an
 * "add your profile first" message.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthedUser(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("profile_chunks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  if (error) {
    return NextResponse.json(
      { error: "Profile lookup failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user_id: auth.userId,
    email: auth.email,
    has_profile: (count ?? 0) > 0,
    profile_chunk_count: count ?? 0,
  });
}
