import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId" },
        { status: 400 }
      );
    }

    // Auth check
    const { createClient } = await import("@/lib/supabase/server");
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Verify ownership and get batch_id
    const { data: job, error: jobError } = await supabase
      .from("bulk_import_jobs")
      .select("id, batch_id, user_id")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Reset job status
    await supabase
      .from("bulk_import_jobs")
      .update({
        status: "queued",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Reset batch to processing if it was completed
    await supabase
      .from("bulk_import_batches")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.batch_id);

    // Fire and forget — re-invoke edge function for this batch
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    fetch(`${supabaseUrl}/functions/v1/bulk-processor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ batchId: job.batch_id, userId: user.id, openRouterKey: process.env.OPENROUTER_API_KEY }),
    }).catch((err) => {
      console.error("Failed to invoke bulk-processor for retry:", err);
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Bulk retry error:", err);
    return NextResponse.json(
      { error: "Failed to retry job" },
      { status: 500 }
    );
  }
}
