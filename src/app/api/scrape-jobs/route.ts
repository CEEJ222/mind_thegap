import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto";

const APIFY_ACTOR = "curious_coder~linkedin-jobs-scraper";
const CACHE_HOURS = 6;

function hashUrl(url: string): string {
  const normalized = url.trim().toLowerCase().replace(/\/+$/, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApifyJob(raw: any): Record<string, unknown> {
  return {
    id: String(raw.id || raw.jobId || raw.linkedinJobId || ""),
    title: raw.title || null,
    company_name: raw.companyName || raw.company || null,
    company_linkedin_url: raw.companyUrl || raw.companyLinkedinUrl || null,
    company_logo: raw.companyLogo || raw.companyLogoUrl || null,
    company_description: raw.companyDescription || null,
    company_website: raw.companyWebsite || null,
    company_employees_count: raw.companyEmployeesCount ? Number(raw.companyEmployeesCount) : null,
    location: raw.location || raw.formattedLocation || null,
    salary_info: raw.salary || raw.salaryInfo || null,
    posted_at: raw.postedAt || raw.listedAt || raw.publishedAt || null,
    employment_type: raw.employmentType || raw.contractType || null,
    seniority_level: raw.seniorityLevel || raw.experienceLevel || null,
    job_function: raw.jobFunction || raw.function || null,
    industries: raw.industries || (raw.industry ? [raw.industry] : null),
    description_text: raw.description || raw.descriptionText || null,
    description_html: raw.descriptionHtml || null,
    apply_url: raw.applyUrl || raw.link || raw.url || null,
    applicants_count: raw.applicantsCount ? Number(raw.applicantsCount) : null,
    job_poster_name: raw.posterName || raw.jobPosterName || null,
    job_poster_title: raw.posterTitle || raw.jobPosterTitle || null,
    job_poster_profile_url: raw.posterProfileUrl || raw.jobPosterProfileUrl || null,
    raw_data: raw,
  };
}

async function resolveApifyKey(userId: string): Promise<string> {
  const serviceClient = createServiceClient();

  // Check for user's own key first
  const { data: keyRow } = await serviceClient
    .from("user_api_keys")
    .select("encrypted_value")
    .eq("user_id", userId)
    .eq("key_type", "apify")
    .limit(1);

  if (keyRow?.[0]) {
    return decryptApiKey(keyRow[0].encrypted_value);
  }

  // Fall back to platform key
  const platformKey = process.env.APIFY_API_TOKEN;
  if (!platformKey) {
    throw new Error("No Apify API key available. Add your own in Settings or contact support.");
  }
  return platformKey;
}

async function callApifyActor(searchUrl: string, apiKey: string): Promise<Record<string, unknown>[]> {
  // Start actor run
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchUrl,
        maxItems: 25,
        proxy: { useApifyProxy: true },
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

  // Poll for completion (max 3 minutes)
  const maxWait = 180_000;
  const pollInterval = 5_000;
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

  // Fetch results from default dataset
  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
  );
  if (!datasetRes.ok) throw new Error("Failed to fetch Apify dataset");

  const items = await datasetRes.json();
  return Array.isArray(items) ? items : [];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { search_url } = await request.json();
    if (!search_url) {
      return NextResponse.json({ error: "Missing search_url" }, { status: 400 });
    }

    const urlHash = hashUrl(search_url);
    const serviceClient = createServiceClient();

    // Check cache
    const { data: cached } = await serviceClient
      .from("search_cache")
      .select("*")
      .eq("search_url_hash", urlHash)
      .limit(1);

    if (cached?.[0] && new Date(cached[0].expires_at) > new Date()) {
      // Return cached job IDs — also fetch job data for the client
      const { data: jobs } = await serviceClient
        .from("jobs")
        .select("*")
        .in("id", cached[0].job_ids);

      return NextResponse.json({
        job_ids: cached[0].job_ids,
        jobs: jobs || [],
        cached: true,
      });
    }

    // Resolve API key and call Apify
    const apiKey = await resolveApifyKey(user.id);
    const rawItems = await callApifyActor(search_url, apiKey);

    // Map and upsert jobs
    const jobIds: string[] = [];
    for (const raw of rawItems) {
      const mapped = mapApifyJob(raw);
      const jobId = mapped.id as string;
      if (!jobId) continue;

      await serviceClient
        .from("jobs")
        .upsert(mapped as Record<string, unknown>, { onConflict: "id" });

      jobIds.push(jobId);
    }

    // Write cache
    const expiresAt = new Date(Date.now() + CACHE_HOURS * 60 * 60 * 1000).toISOString();
    await serviceClient
      .from("search_cache")
      .upsert(
        {
          search_url_hash: urlHash,
          search_url,
          job_ids: jobIds,
          result_count: jobIds.length,
          scraped_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: "search_url_hash" }
      );

    // Fetch full job data
    const { data: jobs } = await serviceClient
      .from("jobs")
      .select("*")
      .in("id", jobIds);

    return NextResponse.json({
      job_ids: jobIds,
      jobs: jobs || [],
      cached: false,
    });
  } catch (err) {
    console.error("Scrape jobs error:", err);
    const message = err instanceof Error ? err.message : "Failed to scrape jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
