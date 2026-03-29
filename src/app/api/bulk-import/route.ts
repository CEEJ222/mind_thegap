import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function extractJobId(url: string): string | null {
  const match = url.match(
    /(?:currentJobId=|jobs\/view\/(?:[^/]*?-)?(?=\d))(\d+)|jobs\/view\/(\d+)/
  );
  return match?.[1] || match?.[2] || null;
}

export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json();

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty urls array" },
        { status: 400 }
      );
    }

    if (urls.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 URLs allowed per batch" },
        { status: 400 }
      );
    }

    // Auth check
    const supabase = createServiceClient();
    const { createClient } = await import("@/lib/supabase/server");
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Filter valid LinkedIn URLs that we can parse
    const validUrls: string[] = [];
    for (const url of urls) {
      if (
        typeof url === "string" &&
        url.includes("linkedin.com") &&
        extractJobId(url)
      ) {
        validUrls.push(url.trim());
      }
    }

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: "No valid LinkedIn job URLs found" },
        { status: 400 }
      );
    }

    // Create batch record
    const { data: batch, error: batchError } = await supabase
      .from("bulk_import_batches")
      .insert({
        user_id: user.id,
        status: "queued",
        urls: validUrls,
        total_count: validUrls.length,
      })
      .select()
      .single();

    if (batchError) throw batchError;

    // Create individual job records
    const jobRecords = validUrls.map((url) => ({
      batch_id: batch.id,
      user_id: user.id,
      url,
      status: "queued",
    }));

    const { error: jobsError } = await supabase
      .from("bulk_import_jobs")
      .insert(jobRecords);

    if (jobsError) throw jobsError;

    // Fire and forget — call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    fetch(`${supabaseUrl}/functions/v1/bulk-processor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ batchId: batch.id, userId: user.id }),
    }).catch((err) => {
      console.error("Failed to invoke bulk-processor edge function:", err);
    });

    return NextResponse.json({ batchId: batch.id });
  } catch (err) {
    console.error("Bulk import error:", err);
    return NextResponse.json(
      { error: "Failed to start bulk import" },
      { status: 500 }
    );
  }
}
