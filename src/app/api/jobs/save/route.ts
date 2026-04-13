import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuthedUser } from "@/lib/api-auth";

/**
 * POST /api/jobs/save
 *
 * Save a job posting the user found off-platform (e.g. via the Mind the App
 * Chrome extension on Greenhouse / Lever / Ashby). Upserts into the global
 * `jobs` table keyed by a URL-derived stable ID, then upserts the per-user
 * row in `user_jobs` with status='saved'.
 *
 * Body:
 *   {
 *     url: string,               // apply URL (required)
 *     title?: string,            // role title
 *     company?: string,          // company name
 *     description?: string,      // full JD text (raw, already normalized)
 *     location?: string,         // "Culver City, CA" etc
 *     ats_type?: "greenhouse" | "lever" | "ashby" | "linkedin" | "generic"
 *   }
 *
 * Response:
 *   { job_id, status: "saved", created: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthedUser(request);
    if (auth instanceof NextResponse) return auth;
    const userId = auth.userId;

    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { error: "Missing url", code: "MISSING_URL" },
        { status: 400 },
      );
    }

    const title = stringOrNull(body.title);
    const company = stringOrNull(body.company);
    const description = stringOrNull(body.description);
    const location = stringOrNull(body.location);
    const atsType = stringOrNull(body.ats_type);

    const supabase = createServiceClient();

    // Stable, URL-keyed job id so re-saving the same posting deduplicates.
    // Prefix keeps these rows distinct from LinkedIn-scraped jobs that use
    // LinkedIn's numeric id as the primary key.
    const jobId = `ext:${hashUrl(url)}`;

    const jobRow: Record<string, unknown> = {
      id: jobId,
      apply_url: url,
    };
    if (title) jobRow.title = title;
    if (company) jobRow.company_name = company;
    if (description) jobRow.description_text = description;
    if (location) jobRow.location = location;
    if (atsType) jobRow.raw_data = { ats_type: atsType, source: "extension" };

    const { error: jobError } = await supabase
      .from("jobs")
      .upsert(jobRow, { onConflict: "id" });
    if (jobError) {
      console.error("[jobs/save] jobs upsert failed:", jobError);
      return NextResponse.json(
        { error: "Could not save job", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    // Track whether this was a fresh save vs. re-save for UI copy.
    const { data: existingUserJob } = await supabase
      .from("user_jobs")
      .select("id, status")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();

    const { error: userJobError } = await supabase
      .from("user_jobs")
      .upsert(
        {
          user_id: userId,
          job_id: jobId,
          status: "saved",
        },
        { onConflict: "user_id,job_id" },
      );
    if (userJobError) {
      console.error("[jobs/save] user_jobs upsert failed:", userJobError);
      return NextResponse.json(
        { error: "Could not save job", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      job_id: jobId,
      status: "saved",
      created: !existingUserJob,
    });
  } catch (err) {
    console.error("[jobs/save] unhandled:", err);
    return NextResponse.json(
      { error: "Internal error", code: "INTERNAL" },
      { status: 500 },
    );
  }
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashUrl(url: string): string {
  // Drop query strings / trackers (utm_*, ref, etc) so the same canonical
  // posting hashes the same regardless of referrer.
  let canonical = url;
  try {
    const u = new URL(url);
    const stripped = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (/^utm_|^ref$|^source$/i.test(k)) return;
      stripped.set(k, v);
    });
    const qs = stripped.toString();
    canonical = `${u.origin}${u.pathname}${qs ? `?${qs}` : ""}`;
  } catch {
    /* fall back to raw url */
  }
  return createHash("sha256")
    .update(canonical)
    .digest("base64url")
    .slice(0, 24);
}
