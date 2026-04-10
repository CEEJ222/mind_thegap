import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  clampScore,
  normalizeAnalysisPayload,
  normalizeScoreTier,
} from "@/lib/analysis-payload";
import { chatCompletion, MODELS } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jd_text = body.jd_text as string;
    const user_id = body.user_id as string;

    if (!jd_text || !user_id) {
      return NextResponse.json(
        { error: "Missing jd_text or user_id" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: chunks } = await supabase
      .from("profile_chunks")
      .select("*")
      .eq("user_id", user_id);

    const profileContext = (chunks ?? [])
      .map(
        (c: Record<string, string | null>) =>
          `[${c.company_name || "Unknown"} | ${c.job_title || "Unknown"}] ${c.chunk_text}`
      )
      .join("\n");

    const text = await chatCompletion({
      model: MODELS.REASONING,
      messages: [
        {
          role: "user",
          content: `You are an expert career analyst. Analyze this job description against the candidate's profile data.

## Job Description
${jd_text}

## Candidate Profile Data
${profileContext || "No profile data available yet."}

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
      ],
    });

    let analysis: ReturnType<typeof normalizeAnalysisPayload>;
    try {
      analysis = normalizeAnalysisPayload(JSON.parse(text));
    } catch {
      return NextResponse.json(
        {
          error: "Could not parse analysis from the model",
          code: "PARSE_ERROR",
        },
        { status: 422 }
      );
    }

    // Deduplicate: reuse existing application row for same user + company + job title
    const { data: existing } = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", user_id)
      .ilike("company_name", analysis.company_name)
      .ilike("job_title", analysis.job_title)
      .limit(1)
      .maybeSingle();

    let application: { id: string };

    if (existing) {
      // Update fit score + JD text on existing row
      const { data: updated, error: updateErr } = await supabase
        .from("applications")
        .update({
          fit_score: Math.round(analysis.fit_score),
          jd_text,
          company_name: analysis.company_name,
          job_title: analysis.job_title,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (updateErr || !updated) throw updateErr ?? new Error("Update failed");
      application = updated;
      // Delete old themes so we replace them with fresh analysis
      await supabase.from("application_themes").delete().eq("application_id", existing.id);
    } else {
      const { data: inserted, error: appError } = await supabase
        .from("applications")
        .insert({
          user_id,
          company_name: analysis.company_name,
          job_title: analysis.job_title,
          jd_text,
          fit_score: Math.round(analysis.fit_score),
        })
        .select("id")
        .single();
      if (appError || !inserted) throw appError ?? new Error("Insert failed");
      application = inserted;
    }

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

    const { data: savedThemes } = await supabase
      .from("application_themes")
      .insert(themesToInsert)
      .select();

    return NextResponse.json({
      application_id: application.id,
      company_name: analysis.company_name,
      job_title: analysis.job_title,
      fit_score: Math.round(analysis.fit_score),
      themes: savedThemes ?? [],
    });
  } catch (err) {
    console.error("Analysis error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Analysis failed",
        code: "INTERNAL",
        ...(process.env.NODE_ENV === "development" && { details: message }),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const patchBody = await request.json();
    const theme_id = patchBody.theme_id as string;
    const application_id = patchBody.application_id as string;
    const patch_user_id = patchBody.user_id as string;

    const supabase = createServiceClient();

    const { data: theme } = await supabase
      .from("application_themes")
      .select("*")
      .eq("id", theme_id)
      .single();

    if (!theme) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    const { data: app } = await supabase
      .from("applications")
      .select("jd_text")
      .eq("id", application_id)
      .single();

    const { data: patchChunks } = await supabase
      .from("profile_chunks")
      .select("*")
      .eq("user_id", patch_user_id);

    const profileContext = (patchChunks ?? [])
      .map(
        (c: Record<string, string | null>) =>
          `[${c.company_name || "Unknown"} | ${c.job_title || "Unknown"}] ${c.chunk_text}`
      )
      .join("\n");

    const text = await chatCompletion({
      model: MODELS.LIGHT,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Re-score this single theme from a gap analysis. The user has added new evidence to their profile.

## Theme: ${theme.theme_name}
## Previous Score: ${theme.score_numeric}/100 (${theme.score_tier})

## Job Description context:
${app?.jd_text ?? ""}

## Updated Candidate Profile (includes new evidence):
${profileContext}

## Scoring Rules:
- "strong" = score 75-100: Clear, direct evidence in the profile
- "weak" = score 35-74: Indirect or partial evidence
- "none" = score 0-34: No evidence found
- The score_numeric MUST match the tier range above

Respond with JSON only:
{
  "score_tier": "strong" | "weak" | "none",
  "score_numeric": number (must match tier range),
  "explanation": "string"
}`,
        },
      ],
    });

    let updated: {
      score_tier: string;
      score_numeric: number;
      explanation: string;
    };
    try {
      updated = JSON.parse(text) as typeof updated;
    } catch {
      return NextResponse.json(
        { error: "Could not parse rescore from the model", code: "PARSE_ERROR" },
        { status: 422 }
      );
    }
    updated.score_numeric = clampScore(updated.score_numeric);
    updated.score_tier = normalizeScoreTier(updated.score_tier);

    // Enforce tier/score consistency — AI sometimes returns mismatched values
    if (updated.score_tier === "strong" && updated.score_numeric < 70) {
      updated.score_numeric = Math.max(75, updated.score_numeric + 70);
    } else if (updated.score_tier === "weak" && (updated.score_numeric < 30 || updated.score_numeric > 69)) {
      updated.score_numeric = Math.min(69, Math.max(30, updated.score_numeric));
    } else if (updated.score_tier === "none" && updated.score_numeric > 29) {
      updated.score_numeric = Math.min(29, updated.score_numeric);
    }

    await supabase
      .from("application_themes")
      .update({
        score_tier: updated.score_tier,
        score_numeric: updated.score_numeric,
        explanation: updated.explanation,
      })
      .eq("id", theme_id);

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Rescore error:", err);
    return NextResponse.json({ error: "Rescore failed" }, { status: 500 });
  }
}
