import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const batchId = request.nextUrl.searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json(
        { error: "Missing batchId parameter" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [batchRes, jobsRes] = await Promise.all([
      supabase
        .from("bulk_import_batches")
        .select("id, status, total_count, completed_count, failed_count")
        .eq("id", batchId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("bulk_import_jobs")
        .select(
          "id, url, status, job_title, company_name, fit_score, resume_url, application_id, error_message"
        )
        .eq("batch_id", batchId)
        .eq("user_id", user.id)
        .order("created_at"),
    ]);

    if (batchRes.error || !batchRes.data) {
      return NextResponse.json(
        { error: "Batch not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      batch: batchRes.data,
      jobs: jobsRes.data ?? [],
    });
  } catch (err) {
    console.error("Bulk status error:", err);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
