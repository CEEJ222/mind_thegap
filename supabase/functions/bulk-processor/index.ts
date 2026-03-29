import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// --- LinkedIn job fetching (duplicated from Next.js route — edge can't import it) ---

const CUTOFF_PHRASES = [
  "Show more",
  "Show less",
  "Seniority level",
  "Employment type",
  "Referrals increase your chances",
  "See who you know",
  "is an equal opportunity employer",
  "equal opportunity employer",
  "EEO being the law",
  "qualified applicants will receive consideration",
];

function extractJobId(url: string): string | null {
  const match = url.match(
    /(?:currentJobId=|jobs\/view\/(?:[^/]*?-)?(?=\d))(\d+)|jobs\/view\/(\d+)/
  );
  return match?.[1] || match?.[2] || null;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/ul>/gi, "\n")
    .replace(/<\/ol>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchLinkedInJob(url: string) {
  const jobId = extractJobId(url);
  if (!jobId) throw new Error("Could not extract job ID from URL");

  const guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;

  const res = await fetch(guestUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) throw new Error(`LinkedIn returned ${res.status}`);

  const html = await res.text();

  // Extract title
  const titleMatch =
    html.match(
      /<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i
    ) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? htmlToPlainText(titleMatch[1]).replace(/ \| LinkedIn$/, "").trim()
    : null;

  // Extract company name
  const companyMatch =
    html.match(
      /<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i
    ) ||
    html.match(
      /<a[^>]*class="[^"]*top-card-layout__company-url[^"]*"[^>]*>([\s\S]*?)<\/a>/i
    );
  const company = companyMatch
    ? htmlToPlainText(companyMatch[1]).trim()
    : null;

  // Extract description
  const descMatch =
    html.match(
      /<div[^>]*class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
    ) ||
    html.match(
      /<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i
    ) ||
    html.match(/<div[^>]*id="job-details"[^>]*>([\s\S]*?)<\/div>/i);

  let description = descMatch ? htmlToPlainText(descMatch[1]) : null;

  if (description) {
    for (const phrase of CUTOFF_PHRASES) {
      const idx = description.indexOf(phrase);
      if (idx !== -1) {
        description = description.substring(0, idx).trim();
        break;
      }
    }
  }

  if (!description || description.length < 50) {
    throw new Error("Could not extract job description from LinkedIn");
  }

  return { title, company, description, jobId };
}

// --- OpenRouter chat completion (duplicated from lib/openrouter.ts) ---

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_REASONING = "anthropic/claude-3.5-sonnet";
const MODEL_LIGHT = "anthropic/claude-3.5-haiku";

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();
  return text.trim();
}

async function chatCompletion(
  openRouterKey: string,
  messages: { role: string; content: string }[],
  maxTokens = 4096,
  model = MODEL_REASONING
): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterKey}`,
      "X-Title": "Mind the App",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`OpenRouter error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content;
  return extractJSON(raw);
}

// --- Status update helper ---

// deno-lint-ignore no-explicit-any
async function updateJobStatus(supabase: any, jobId: string, status: string) {
  await supabase
    .from("bulk_import_jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

// --- Main handler ---

Deno.serve(async (req: Request) => {
  try {
    const { batchId, userId, openRouterKey: passedKey } = await req.json();

    if (!batchId) {
      return new Response(JSON.stringify({ error: "Missing batchId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openRouterKey = passedKey || Deno.env.get("OPENROUTER_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all queued jobs for this batch
    const { data: jobs } = await supabase
      .from("bulk_import_jobs")
      .select("*")
      .eq("batch_id", batchId)
      .eq("status", "queued")
      .order("created_at");

    if (!jobs || jobs.length === 0) {
      // No queued jobs — mark batch completed
      await supabase
        .from("bulk_import_batches")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", batchId);

      return new Response(JSON.stringify({ done: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Update batch status to processing
    await supabase
      .from("bulk_import_batches")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", batchId);

    // Resolve userId from the batch if not provided
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const { data: batch } = await supabase
        .from("bulk_import_batches")
        .select("user_id")
        .eq("id", batchId)
        .single();
      effectiveUserId = batch?.user_id;
    }

    // Fetch user profile chunks once (shared across all jobs)
    const { data: chunks } = await supabase
      .from("profile_chunks")
      .select("*")
      .eq("user_id", effectiveUserId);

    const profileContextForAnalysis = (chunks ?? [])
      .map(
        (c: Record<string, string | null>) =>
          `[${c.company_name || "Unknown"} | ${c.job_title || "Unknown"}] ${c.chunk_text}`
      )
      .join("\n");

    const profileDataForResume = (chunks ?? [])
      .map(
        (c: Record<string, string | null>) =>
          `[${c.entry_type} | ${c.company_name || "Unknown"} | ${c.job_title || "Unknown"} | ${c.date_start ?? "?"} - ${c.date_end ?? "Present"}]\n${c.chunk_text}`
      )
      .join("\n\n");

    // Fetch user settings once
    const { data: settingsRows } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", effectiveUserId)
      .limit(1);
    const settings = settingsRows?.[0];

    const lengthMap: Record<string, string> = {
      "1_page": "strictly 1 page maximum",
      "1_5_pages": "1.5 pages maximum",
      "2_pages": "2 pages maximum",
      no_max: "no length restriction",
    };
    const lengthSetting = (settings?.resume_length as string) ?? "1_page";
    const includeSummary = settings?.include_summary ?? true;
    const fullName = (settings?.full_name as string) || "";
    const linkedinUrl = (settings?.linkedin_url as string) || "";
    const contactEmail = (settings?.email as string) || "";
    const phone = (settings?.phone as string) || "";
    const location = (settings?.location as string) || "";
    const contactParts = [fullName, linkedinUrl, contactEmail, phone, location].filter(Boolean);
    const contactHeader = contactParts.join(" | ");

    for (const job of jobs) {
      try {
        // --- FETCH ---
        await updateJobStatus(supabase, job.id, "fetching");
        const { title, company, description } = await fetchLinkedInJob(job.url);
        await supabase
          .from("bulk_import_jobs")
          .update({ job_title: title, company_name: company })
          .eq("id", job.id);

        // --- ANALYZE ---
        await updateJobStatus(supabase, job.id, "analyzing");

        const analysisText = await chatCompletion(openRouterKey, [
          {
            role: "user",
            content: `You are an expert career analyst. Analyze this job description against the candidate's profile data.

## Job Description
${description}

## Candidate Profile Data
${profileContextForAnalysis || "No profile data available yet."}

## Instructions
1. Extract the company name and job title from the JD.
2. Identify 8-10 key themes/requirements from the JD.
3. For each theme, assess the candidate's evidence:
   - "strong": Clear, direct evidence in their profile
   - "weak": Indirect or partial evidence
   - "none": No evidence found
4. Assign a weight (0.0 to 1.0) to each theme based on JD emphasis (frequency, placement, "must have" vs "nice to have").
5. For each theme, provide 2-3 bullet explanation of the rating.
6. Calculate a score_numeric (0-100) for each theme.
7. Calculate an overall fit_score as the weighted average.

Respond in this exact JSON format:
{
  "company_name": "string",
  "job_title": "string",
  "fit_score": number,
  "themes": [
    {
      "theme_name": "string",
      "theme_weight": number,
      "score_tier": "strong" | "weak" | "none",
      "score_numeric": number,
      "explanation": "string with bullet points"
    }
  ]
}

Return ONLY valid JSON, no markdown fences.`,
          },
        ], 4096, MODEL_LIGHT);

        const analysis = JSON.parse(analysisText);

        // Create application record
        const { data: application, error: appError } = await supabase
          .from("applications")
          .insert({
            user_id: effectiveUserId,
            company_name: analysis.company_name || company || title,
            job_title: analysis.job_title || title,
            jd_text: description,
            fit_score: Math.round(analysis.fit_score),
          })
          .select()
          .single();

        if (appError) throw appError;

        // Insert themes
        const themesToInsert = analysis.themes.map(
          (t: {
            theme_name: string;
            theme_weight: number;
            score_tier: string;
            score_numeric: number;
            explanation: string;
          }) => ({
            application_id: application.id,
            theme_name: t.theme_name,
            theme_weight: t.theme_weight,
            score_tier: t.score_tier,
            score_numeric: t.score_numeric,
            explanation: t.explanation,
          })
        );

        await supabase.from("application_themes").insert(themesToInsert);

        // Fetch themes for resume generation
        const { data: savedThemes } = await supabase
          .from("application_themes")
          .select("*")
          .eq("application_id", application.id);

        const themesSummary = (savedThemes ?? [])
          .map(
            (t: Record<string, string | number | null>) =>
              `${t.theme_name} (${t.score_tier}, weight: ${t.theme_weight}): ${t.explanation}`
          )
          .join("\n");

        // --- GENERATE RESUME ---
        await updateJobStatus(supabase, job.id, "generating");

        // Get next version number
        const { data: existingResumes } = await supabase
          .from("generated_resumes")
          .select("version")
          .eq("application_id", application.id)
          .order("version", { ascending: false })
          .limit(1);
        const nextVersion =
          ((existingResumes?.[0]?.version ?? 0) as number) + 1;

        const resumeText = await chatCompletion(
          openRouterKey,
          [
            {
              role: "user",
              content: `You are an expert resume writer. Generate a tailored resume for this job application.

## Contact Header (MUST be the first line of the resume exactly as written)
${contactHeader || "Name | Contact Info"}

## Job Description
${description}

## Gap Analysis Results
${themesSummary}

## Candidate Profile Data
${profileDataForResume}

## Settings
- Length: ${lengthMap[lengthSetting]}
- Include summary section: ${includeSummary ? "yes" : "no"}

## Instructions
1. The FIRST LINE of the resume MUST be the contact header exactly as provided above — name, LinkedIn, email, phone, location separated by pipes.
2. Structure the resume optimally for this role (decide whether to lead with skills, summary, or experience).
3. Emphasize bullets that directly match JD themes — surface them earlier.
4. Enforce the length setting: shorten older roles, remove irrelevant jobs, trim weaker bullets.
5. Full-time roles first (chronological), then contract/temporary roles labeled and grouped.
6. Omit jobs that are too old and irrelevant entirely.
7. Track your editorial decisions.

Respond in this exact JSON format:
{
  "resume_content": "The full resume text in markdown format, ready for PDF/DOCX conversion",
  "editorial_notes": {
    "shortened": [{"role": "string", "reason": "string"}],
    "omitted": [{"role": "string", "reason": "string"}],
    "prioritized": ["string descriptions of what was emphasized"]
  }
}

Return ONLY valid JSON, no markdown fences.`,
            },
          ],
          4096
        );

        const resumeResult = JSON.parse(resumeText);

        // Upload resume to storage
        const format = (settings?.output_format as string) ?? "pdf";
        const filePath = `${effectiveUserId}/${application.id}_v${nextVersion}.md`;

        await supabase.storage
          .from("resumes")
          .upload(
            filePath,
            new Blob([resumeResult.resume_content], {
              type: "text/markdown",
            }),
            { upsert: true }
          );

        // Save generated_resumes record
        await supabase.from("generated_resumes").insert({
          application_id: application.id,
          user_id: effectiveUserId,
          file_path: filePath,
          format,
          length_setting: lengthSetting,
          summary_included: includeSummary,
          editorial_notes: {
            ...resumeResult.editorial_notes,
            resume_content: resumeResult.resume_content,
          },
          version: nextVersion,
        });

        // Get public URL for the resume
        const {
          data: { publicUrl },
        } = supabase.storage.from("resumes").getPublicUrl(filePath);

        // --- COMPLETE ---
        await supabase
          .from("bulk_import_jobs")
          .update({
            status: "ready",
            fit_score: Math.round(analysis.fit_score),
            application_id: application.id,
            resume_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        await supabase.rpc("increment_batch_completed", {
          batch_id: batchId,
        });
      } catch (err) {
        console.error(`Error processing job ${job.id}:`, err);

        await supabase
          .from("bulk_import_jobs")
          .update({
            status: "failed",
            error_message:
              err instanceof Error ? err.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        await supabase.rpc("increment_batch_failed", {
          batch_id: batchId,
        });
      }
    }

    // Mark batch complete
    await supabase
      .from("bulk_import_batches")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", batchId);

    return new Response(
      JSON.stringify({ done: true, processed: jobs.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Bulk processor error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
