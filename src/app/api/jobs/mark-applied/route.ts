import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuthedUser } from "@/lib/api-auth";
import { extensionJobId } from "@/lib/jobs-url";

/**
 * POST /api/jobs/mark-applied
 *
 * Fired by the Mind the App Chrome extension when it detects an ATS
 * confirmation page ("thank you for applying" / submission success).
 * Flips the `user_jobs.status` for the corresponding job to `'applied'`.
 * Creates the jobs row and user_jobs row if they don't exist yet (some
 * users skip "Save for later" and go straight to apply).
 *
 * Body:
 *   {
 *     url: string,              // canonical job URL (required)
 *     title?: string,
 *     company?: string,
 *     ats_type?: string
 *   }
 *
 * Response:
 *   { job_id, status: "applied", previous_status: string | null }
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
    const atsType = stringOrNull(body.ats_type);

    const supabase = createServiceClient();
    const jobId = extensionJobId(url);

    const jobRow: Record<string, unknown> = {
      id: jobId,
      apply_url: url,
    };
    if (title) jobRow.title = title;
    if (company) jobRow.company_name = company;
    if (atsType) jobRow.raw_data = { ats_type: atsType, source: "extension" };

    const { error: jobError } = await supabase
      .from("jobs")
      .upsert(jobRow, { onConflict: "id" });
    if (jobError) {
      console.error("[jobs/mark-applied] jobs upsert failed:", jobError);
      return NextResponse.json(
        { error: "Could not mark applied", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    const { data: existing } = await supabase
      .from("user_jobs")
      .select("status")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();

    const previousStatus = existing?.status ?? null;

    // Only forward-progress: don't downgrade an already-applied row or
    // overwrite a `dismissed` status silently.
    if (previousStatus === "applied") {
      return NextResponse.json({
        job_id: jobId,
        status: "applied",
        previous_status: previousStatus,
      });
    }

    const { error: userJobError } = await supabase
      .from("user_jobs")
      .upsert(
        {
          user_id: userId,
          job_id: jobId,
          status: "applied",
        },
        { onConflict: "user_id,job_id" },
      );
    if (userJobError) {
      console.error(
        "[jobs/mark-applied] user_jobs upsert failed:",
        userJobError,
      );
      return NextResponse.json(
        { error: "Could not mark applied", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      job_id: jobId,
      status: "applied",
      previous_status: previousStatus,
    });
  } catch (err) {
    console.error("[jobs/mark-applied] unhandled:", err);
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
