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
          role: "user",
          content: `You are an expert resume writer. Generate a tailored resume for this job application.

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
    });

    const result = JSON.parse(text);

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
        editorial_notes: { ...result.editorial_notes, resume_content: result.resume_content },
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
