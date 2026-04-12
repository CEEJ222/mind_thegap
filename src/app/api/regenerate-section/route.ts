import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";
import {
  formatThemeEvidenceForPrompt,
  type ThemeForEvidence,
} from "@/lib/theme-evidence-prompt";

export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json();
    const {
      application_id,
      resume_id,
      override_item,
      override_instruction,
    } = reqBody;

    if (!application_id || !resume_id || !override_item) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Fetch the existing resume record to get the current content and editorial notes
    const { data: existingResume, error: resumeError } = await supabase
      .from("generated_resumes")
      .select("*")
      .eq("id", resume_id)
      .limit(1);

    if (resumeError || !existingResume?.[0]) {
      return NextResponse.json(
        { error: "Resume not found" },
        { status: 404 }
      );
    }

    const currentResume = existingResume[0];
    const currentNotes = currentResume.editorial_notes as Record<string, unknown>;
    const currentContent = (currentNotes?.resume_content as string) || "";
    const user_id = currentResume.user_id as string;

    // Fetch the application for the JD
    const [appRes, chunksRes] = await Promise.all([
      supabase
        .from("applications")
        .select("*")
        .eq("id", application_id)
        .limit(1),
      supabase
        .from("profile_chunks")
        .select("*")
        .eq("user_id", user_id),
    ]);

    const application = appRes.data?.[0];
    const chunks = chunksRes.data ?? [];

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const profileData = chunks
      .map(
        (c: Record<string, string | null>) =>
          `[${c.entry_type} | ${c.company_name || "Unknown"} | ${c.job_title || "Unknown"} | ${c.date_start ?? "?"} - ${c.date_end ?? "Present"}]\n${c.chunk_text}`
      )
      .join("\n\n");

    // Fetch settings for contact header and length
    const { data: settingsData } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user_id)
      .limit(1);

    const settings = settingsData?.[0];
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

    // Fetch themes for context
    const { data: themes } = await supabase
      .from("application_themes")
      .select("*")
      .eq("application_id", application_id);

    const themesSummary = (themes ?? [])
      .map(
        (t: Record<string, string | number | null>) =>
          `${t.theme_name} (${t.score_tier}, weight: ${t.theme_weight}): ${t.explanation}`
      )
      .join("\n");

    const themeEvidenceBlock = await formatThemeEvidenceForPrompt(
      supabase,
      user_id,
      (themes ?? []) as ThemeForEvidence[]
    );

    const text = await chatCompletion({
      model: MODELS.REASONING,
      messages: [
        {
          role: "system",
          content: `You are an expert resume writer and career strategist. You are regenerating a
resume with a user override applied. The user has reviewed your editorial decisions
and explicitly requested that a specific item be included.

## USER OVERRIDES — THESE ARE MANDATORY AND CANNOT BE COUNTERMANDED

The following items were in your initial editorial decisions but the user has
explicitly overridden them. You MUST include these items regardless of your
editorial judgment:

${override_item}: ${override_instruction}

Apply these overrides first, then make other editorial decisions to hit the
length target. Do NOT re-omit or re-shorten any user-overridden item.

## EDITORIAL DECISION FRAMEWORK

### What to INCLUDE
- Any experience with concrete production metrics
- Any experience that directly maps to required or preferred skills in the JD
- Technical projects with hands-on implementation
- Projects that are LIVE and serving real users
- Agentic AI, LLM, RAG, vector DB, or AI workflow experience for AI-focused roles

### What to SHORTEN (not omit — reduce to 1-2 bullets)
- Roles older than 8 years that don't directly relate to the target role
- Tangentially relevant roles — keep the most impressive metric only

### What to OMIT (only these specific cases)
- Roles that predate the candidate's relevant career track by 10+ years AND have zero relevance
- Projects with NO description, NO metrics, and NO technical detail whatsoever

### LENGTH ENFORCEMENT
Apply cuts in this order until the target length is met:
1. Trim individual bullets (remove weakest per role, keep strongest 3-4)
2. Shorten older/less relevant roles to 2 bullets
3. Omit roles that fail ALL inclusion criteria
4. Never cut a role's strongest metric bullet

### EDITORIAL NOTES
For each decision, be specific about WHY. Never use "early stage" or "incomplete."
For user-overridden items, note: "Included per user override"`,
        },
        {
          role: "user",
          content: `Regenerate this resume with the user override applied.

## Contact Header (MUST be the first line of the resume exactly as written)
${contactHeader || "Name | Contact Info"}

## Job Description
${application.jd_text}

## Gap Analysis Results
${themesSummary}

${themeEvidenceBlock ? `${themeEvidenceBlock}\n\n` : ""}## Candidate Profile Data (full profile — use together with theme-ranked evidence above)
${profileData}

## Previous Resume Content (for reference)
${currentContent}

## Settings
- Length: ${lengthMap[lengthSetting]}
- Include summary section: ${includeSummary ? "yes" : "no"}

## Instructions
1. The FIRST LINE of the resume MUST be the contact header exactly as provided above.
2. Apply the user override FIRST — the overridden item MUST be included.
3. Then apply editorial decisions to other items to hit the length target.
4. Track your editorial decisions with specific reasoning.
5. Mark overridden items as "Included per user override" in editorial notes.

Respond in this exact JSON format:
{
  "resume_content": "The full resume text in markdown format",
  "editorial_notes": {
    "shortened": [{"role": "string", "reason": "string", "userOverride": "keep or null"}],
    "omitted": [{"role": "string", "reason": "string", "userOverride": "keep or null"}],
    "prioritized": ["string descriptions of what was emphasized"]
  }
}

Return ONLY valid JSON, no markdown fences.`,
        },
      ],
    });

    const result = JSON.parse(text);

    // Store as new version
    const nextVersion = ((currentResume.version as number) ?? 0) + 1;
    const filePath = `${user_id}/${application_id}_v${nextVersion}.md`;

    await supabase.storage
      .from("resumes")
      .upload(filePath, new Blob([result.resume_content], { type: "text/markdown" }), {
        upsert: true,
      });

    const { data: newResume } = await supabase
      .from("generated_resumes")
      .insert({
        application_id,
        user_id,
        file_path: filePath,
        format: currentResume.format,
        length_setting: currentResume.length_setting,
        summary_included: currentResume.summary_included,
        editorial_notes: { ...result.editorial_notes, resume_content: result.resume_content },
        version: nextVersion,
      })
      .select()
      .single();

    return NextResponse.json({
      resume_id: newResume?.id,
      file_path: filePath,
      editorial_notes: result.editorial_notes,
    });
  } catch (err) {
    console.error("Regenerate-section error:", err);
    return NextResponse.json(
      { error: "Override regeneration failed" },
      { status: 500 }
    );
  }
}
