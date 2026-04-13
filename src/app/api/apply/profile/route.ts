import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuthedUser } from "@/lib/api-auth";

/**
 * GET /api/apply/profile
 *
 * Returns the subset of the user's profile safe to autofill into ATS
 * application forms. Called by the Mind the App Chrome extension when
 * the user clicks "Autofill" on a Greenhouse / Lever / Ashby apply form.
 *
 * Scope is intentionally narrow — contact basics, portfolio links,
 * work-auth answers. EEO/demographic fields live in user_settings too
 * but are deferred since they map to site-specific dropdown values and
 * we'd rather leave blanks than misclassify a user.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthedUser(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select(
      "full_name, preferred_name, email, phone, linkedin_url, github_url, website_url, location, work_authorization, requires_sponsorship, open_to_relocation",
    )
    .eq("user_id", auth.userId)
    .maybeSingle();

  // Fall back to the users table for full_name/email if user_settings hasn't
  // been populated yet — same pattern as /api/apply/parse.
  const { data: userRow } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", auth.userId)
    .maybeSingle();

  return NextResponse.json({
    full_name: settings?.full_name || userRow?.full_name || null,
    preferred_name: settings?.preferred_name || null,
    email: settings?.email || userRow?.email || auth.email,
    phone: settings?.phone || null,
    linkedin_url: settings?.linkedin_url || null,
    github_url: settings?.github_url || null,
    website_url: settings?.website_url || null,
    location: settings?.location || null,
    work_authorization: settings?.work_authorization || null,
    requires_sponsorship: settings?.requires_sponsorship ?? null,
    open_to_relocation: settings?.open_to_relocation ?? null,
  });
}
