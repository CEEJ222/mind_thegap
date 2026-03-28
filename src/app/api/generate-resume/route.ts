import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json();
    const application_id = reqBody.application_id as string;
    const user_id = reqBody.user_id as string;

    if (!application_id || !user_id) {
      return NextResponse.json(
        { error: "Missing application_id or user_id" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const [appRes, settingsRes, chunksRes, themesRes, existingRes] =
      await Promise.all([
        supabase
          .from("applications")
          .select("*")
          .eq("id", application_id)
          .limit(1),
        supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user_id)
          .limit(1),
        supabase
          .from("profile_chunks")
          .select("*")
          .eq("user_id", user_id),
        supabase
          .from("application_themes")
          .select("*")
          .eq("application_id", application_id),
        supabase
          .from("generated_resumes")
          .select("version")
          .eq("application_id", application_id)
          .order("version", { ascending: false })
          .limit(1),
      ]);

    const application = appRes.data?.[0];
    const settings = settingsRes.data?.[0];
    const chunks = chunksRes.data ?? [];
    const themes = themesRes.data ?? [];
    const nextVersion = ((existingRes.data?.[0]?.version ?? 0) as number) + 1;

    console.log("Generate resume debug:", {
      application_id,
      user_id,
      appFound: !!application,
      appError: appRes.error?.message,
      appDataLength: appRes.data?.length,
      settingsFound: !!settings,
      settingsError: settingsRes.error?.message,
      chunksCount: chunks.length,
      themesCount: themes.length,
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found", debug: { appError: appRes.error?.message, appDataLength: appRes.data?.length } },
        { status: 404 }
      );
    }

    const profileData = chunks
      .map(
        (c: Record<string, string | null>) =>
          `[${c.entry_type} | ${c.company_name || "Unknown"} | ${c.job_title || "Unknown"} | ${c.date_start ?? "?"} - ${c.date_end ?? "Present"}]\n${c.chunk_text}`
      )
      .join("\n\n");

    const themesSummary = themes
      .map(
        (t: Record<string, string | number | null>) =>
          `${t.theme_name} (${t.score_tier}, weight: ${t.theme_weight}): ${t.explanation}`
      )
      .join("\n");

    const lengthMap: Record<string, string> = {
      "1_page": "strictly 1 page maximum",
      "1_5_pages": "1.5 pages maximum",
      "2_pages": "2 pages maximum",
      no_max: "no length restriction",
    };

    const lengthSetting = (settings?.resume_length as string) ?? "1_page";
    const includeSummary = settings?.include_summary ?? true;
    const fullName = (settings?.full_name as string) || "";
    const websiteUrl = (settings?.website_url as string) || "";
    const linkedinUrl = (settings?.linkedin_url as string) || "";
    const contactEmail = (settings?.email as string) || "";
    const phone = (settings?.phone as string) || "";
    const location = (settings?.location as string) || "";

    // Build contact header line — website first, then linkedin
    const contactParts = [fullName, websiteUrl, linkedinUrl, contactEmail, phone, location].filter(Boolean);
    const contactHeader = contactParts.join(" | ");

    const text = await chatCompletion({
      model: MODELS.REASONING,
      messages: [
        {
          role: "system",
          content: `You are an expert resume writer and career strategist. Your job is to generate a
tailored, editorial-quality resume based on the candidate's profile data and the
specific job description provided.

## EDITORIAL DECISION FRAMEWORK

### What to INCLUDE
- Any experience — job or project — with concrete production metrics (users, revenue,
  cost savings, conversion rates, uptime, response times, etc.)
- Any experience that directly maps to required or preferred skills in the JD
- Technical projects that demonstrate hands-on implementation, not just awareness
- Projects that are LIVE and serving real users, regardless of scale
- Agentic AI, LLM, RAG, vector DB, or AI workflow experience for any AI-focused role

### What to SHORTEN (not omit — reduce to 1-2 bullets)
- Roles older than 8 years that don't directly relate to the target role
- Roles that are tangentially relevant — keep the most impressive metric only
- Duplicate responsibilities across multiple roles — consolidate

### What to OMIT (only these specific cases)
- Roles that predate the candidate's relevant career track by 10+ years AND have zero
  relevance to the target role
- Projects with NO description, NO metrics, and NO technical detail whatsoever
- Pure hobby projects with no production deployment or real users

### CRITICAL RULES FOR PROJECTS

**DO NOT omit a project based on perceived "completeness" or "stage."**
Judge projects ONLY on these criteria:
1. Does it have production metrics? (users, revenue, performance numbers) → INCLUDE
2. Does it demonstrate a skill explicitly required or preferred in the JD? → INCLUDE
3. Is it live and deployed? → INCLUDE
4. Does it show technical depth relevant to this role? → INCLUDE

A project is "strong" if it has ANY of the above. A project must fail ALL four
criteria to be considered for omission.

**For AI-focused roles specifically:**
- Any project demonstrating agentic AI, multi-step AI workflows, RAG, vector databases,
  LLM orchestration, or AI cost optimization is HIGH PRIORITY and should NEVER be
  omitted unless it has zero description
- Production metrics like cache hit rates, response times, cost-per-analysis, and
  user counts are strong signals of a real, complete project
- "Early stage" is NOT a valid reason to omit. Many strong AI candidates have
  projects at various stages — what matters is technical depth and real deployment

### ORDERING LOGIC

1. Most recent and most relevant experience first
2. For projects section: order by relevance to JD, then by metric strength
3. If the JD emphasizes AI/agentic experience, AI projects should appear BEFORE
   older traditional PM work

### LENGTH ENFORCEMENT

Apply cuts in this order until the target length is met:
1. First: trim individual bullets (remove weakest bullet per role, keep strongest 3-4)
2. Second: shorten older/less relevant roles to 2 bullets
3. Third: omit roles that fail ALL four project criteria above
4. Never cut a role's strongest metric bullet — that's the last thing to go

### WHAT TO SAY IN EDITORIAL NOTES

For each decision, be specific about WHY using evidence from the profile:
- BAD: "SENSER omitted: Too early stage/incomplete"
- GOOD: "SENSER shortened to 2 bullets: strong AI metrics present but word count
  needed for length target; kept agentic workflow bullet and cache hit rate metric"

Never describe a project as "early stage" or "incomplete" — those are subjective
judgments. Only describe what you actually did: included, shortened to N bullets,
or omitted because it had zero description.`,
        },
        {
          role: "user",
          content: `Generate a tailored resume for this job application.

## Contact Header (MUST be the first line of the resume exactly as written)
${contactHeader || "Name | Contact Info"}

## Job Description
${application.jd_text}

## Gap Analysis Results
${themesSummary}

## Candidate Profile Data
${profileData}

## Settings
- Length: ${lengthMap[lengthSetting]}
- Include summary section: ${includeSummary ? "yes" : "no"}

## Instructions
1. The FIRST LINE of the resume MUST be the contact header exactly as provided above — name, LinkedIn, email, phone, location separated by pipes.
2. Structure the resume optimally for this role (decide whether to lead with skills, summary, or experience).
3. Emphasize bullets that directly match JD themes — surface them earlier.
4. Enforce the length setting using the editorial decision framework above.
5. Full-time roles first (chronological), then contract/temporary roles labeled and grouped.
6. Track your editorial decisions with specific, evidence-based reasoning.

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
    });

    // Strip markdown fences if the model wrapped JSON.
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }

    // Remove/escape control characters that can break JSON.parse.
    cleaned = cleaned.replace(/[\x00-\x1f]/g, (ch) =>
      ch === "\n" || ch === "\r" || ch === "\t" ? ch : " "
    );

    let result: { resume_content: string; editorial_notes: Record<string, unknown> };
    try {
      // Attempt 1: parse as-is.
      result = JSON.parse(cleaned);
    } catch {
      // Attempt 2: escape literal newlines/tabs inside resume_content.
      const fixed = cleaned.replace(
        /"resume_content"\s*:\s*"([\s\S]*?)"\s*,\s*"editorial_notes"/,
        (_, content) => {
          const escaped = content
            .replace(/\r\n/g, "\\n")
            .replace(/\r/g, "\\n")
            .replace(/\n/g, "\\n")
            .replace(/\t/g, "\\t");
          return `"resume_content": "${escaped}","editorial_notes"`;
        }
      );
      try {
        result = JSON.parse(fixed);
      } catch {
        // Attempt 3: best-effort extraction of resume_content.
        const contentMatch = cleaned.match(/"resume_content"\s*:\s*"([\s\S]*?)(?<!\\)"/);
        if (!contentMatch) {
          throw new Error(`Failed to parse resume JSON: ${cleaned.slice(0, 300)}`);
        }
        result = {
          resume_content: contentMatch[1].replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
          editorial_notes: {},
        };
      }
    }

    const format = (settings?.output_format as string) ?? "pdf";
    const filePath = `${user_id}/${application_id}_v${nextVersion}.md`;

    await supabase.storage
      .from("resumes")
      .upload(filePath, new Blob([result.resume_content], { type: "text/markdown" }), {
        upsert: true,
      });

    const { data: resume } = await supabase
      .from("generated_resumes")
      .insert({
        application_id,
        user_id,
        file_path: filePath,
        format,
        length_setting: lengthSetting,
        summary_included: includeSummary,
        editorial_notes: { ...(result.editorial_notes ?? {}), resume_content: result.resume_content },
        version: nextVersion,
      })
      .select()
      .single();

    return NextResponse.json({
      resume_id: resume?.id,
      file_path: filePath,
      editorial_notes: result.editorial_notes,
    });
  } catch (err) {
    console.error("Resume generation error:", err);
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    );
  }
}
