import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto";

const APIFY_ACTOR = "curious_coder~linkedin-jobs-scraper";

function extractJobId(url: string): string | null {
  // Match patterns like /jobs/view/3692563200 or /jobs/3692563200
  const match = url.match(/\/jobs\/(?:view\/)?(\d+)/);
  return match ? match[1] : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApifyJob(raw: any): Record<string, unknown> {
  return {
    id: String(raw.id || ""),
    title: raw.title || null,
    company_name: raw.companyName || null,
    company_linkedin_url: raw.companyLinkedinUrl || null,
    company_logo: raw.companyLogo || null,
    company_description: raw.companyDescription || null,
    company_website: raw.companyWebsite || null,
    company_employees_count: raw.companyEmployeesCount ? Number(raw.companyEmployeesCount) : null,
    location: raw.location || null,
    salary_info: raw.salaryInfo || null,
    posted_at: raw.postedAt || null,
    employment_type: raw.employmentType || null,
    seniority_level: raw.seniorityLevel || null,
    job_function: raw.jobFunction || null,
    industries: raw.industries ? (Array.isArray(raw.industries) ? raw.industries : [raw.industries]) : null,
    description_text: raw.descriptionText || null,
    description_html: raw.descriptionHtml || null,
    apply_url: raw.applyUrl || raw.link || null,
    applicants_count: raw.applicantsCount ? Number(String(raw.applicantsCount).replace(/[^0-9]/g, "")) : null,
    job_poster_name: raw.jobPosterName || null,
    job_poster_title: raw.jobPosterTitle || null,
    job_poster_profile_url: raw.jobPosterProfileUrl || null,
    raw_data: raw,
  };
}

async function resolveApifyKey(userId: string): Promise<string> {
  const serviceClient = createServiceClient();
  const { data: keyRow } = await serviceClient
    .from("user_api_keys")
    .select("encrypted_value")
    .eq("user_id", userId)
    .eq("key_type", "apify")
    .limit(1);

  if (keyRow?.[0]) {
    return decryptApiKey(keyRow[0].encrypted_value);
  }

  const platformKey = process.env.APIFY_API_TOKEN;
  if (!platformKey) {
    throw new Error("No Apify API key available. Add your own in Settings.");
  }
  return platformKey;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { job_url } = await request.json();
    if (!job_url) {
      return NextResponse.json({ error: "Missing job_url" }, { status: 400 });
    }

    const jobId = extractJobId(job_url);
    if (!jobId) {
      return NextResponse.json(
        { error: "That doesn't look like a LinkedIn job URL. Please use a URL like linkedin.com/jobs/view/123456 (not a company or profile URL)" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // Check if job already exists
    const { data: existing } = await serviceClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .limit(1);

    if (existing?.[0]) {
      return NextResponse.json({ job: existing[0], cached: true });
    }

    // Scrape the single job
    const apiKey = await resolveApifyKey(user.id);

    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [job_url],
          count: 10,
          scrapeCompany: true,
        }),
      }
    );

    if (!startRes.ok) {
      const err = await startRes.text();
      throw new Error(`Apify actor start failed (${startRes.status}): ${err}`);
    }

    const runData = await startRes.json();
    const runId = runData.data?.id;
    if (!runId) throw new Error("No run ID returned from Apify");

    // Poll for completion (max 2 minutes for single job)
    const maxWait = 120_000;
    const pollInterval = 4_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
      );
      const statusData = await statusRes.json();
      const status = statusData.data?.status;
      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        throw new Error(`Apify run ${status}`);
      }
    }

    // Fetch result
    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
    );
    const items = await datasetRes.json();
    const rawItems = Array.isArray(items) ? items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "Job not found or no longer available on LinkedIn" },
        { status: 404 }
      );
    }

    // Find the specific job matching our ID from the results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchingRaw = rawItems.find((item: any) => String(item.id) === jobId) || rawItems[0];
    const mapped = mapApifyJob(matchingRaw);
    // Use the extracted job ID if Apify returns a different one
    if (!mapped.id || mapped.id === "undefined" || mapped.id !== jobId) {
      mapped.id = jobId;
    }

    await serviceClient
      .from("jobs")
      .upsert(mapped as Record<string, unknown>, { onConflict: "id" });

    // Fetch back the stored job
    const { data: job } = await serviceClient
      .from("jobs")
      .select("*")
      .eq("id", mapped.id as string)
      .limit(1);

    return NextResponse.json({ job: job?.[0] || mapped, cached: false });
  } catch (err) {
    console.error("Import job URL error:", err);
    const message = err instanceof Error ? err.message : "Failed to import job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
