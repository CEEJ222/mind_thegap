import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user_id = body.user_id as string;

    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get all profile entries and chunks
    const [entriesRes, chunksRes] = await Promise.all([
      supabase
        .from("profile_entries")
        .select("company_name, job_title, entry_type, date_start, date_end, industry, domain, company_description")
        .eq("user_id", user_id)
        .order("date_start", { ascending: false }),
      supabase
        .from("profile_chunks")
        .select("chunk_text, company_name, job_title, entry_type")
        .eq("user_id", user_id),
    ]);

    const entries = entriesRes.data ?? [];
    const chunks = chunksRes.data ?? [];

    if (entries.length === 0) {
      return NextResponse.json({ summary: null });
    }

    // Build context
    const entryList = entries
      .filter((e: Record<string, string | null>) => e.entry_type !== "skills")
      .map((e: Record<string, string | null>) =>
        `${e.company_name} | ${e.job_title} | ${e.entry_type} | ${e.date_start ?? "?"} – ${e.date_end ?? "present"}${e.company_description ? ` | ${e.company_description}` : ""}${e.industry ? ` | Industry: ${e.industry}` : ""}`
      )
      .join("\n");

    const skillChunks = chunks
      .filter((c: Record<string, string | null>) => c.entry_type === "skills")
      .map((c: Record<string, string>) => c.chunk_text)
      .join(", ");

    const keyBullets = chunks
      .filter((c: Record<string, string | null>) => c.entry_type !== "skills")
      .slice(0, 15)
      .map((c: Record<string, string>) => c.chunk_text)
      .join("\n");

    const response = await chatCompletion({
      model: MODELS.LIGHT,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Write a concise 2-3 sentence professional summary for this person's profile. It should read like a LinkedIn headline + summary — who they are, what they specialize in, and their key strengths. Do NOT use first person. Use third person or implied subject.

## Roles
${entryList}

## Key Skills
${skillChunks || "Not specified"}

## Sample Achievements
${keyBullets}

Write ONLY the summary text, no quotes, no labels, no formatting. 2-3 sentences max.`,
        },
      ],
    });

    // Clean up any quotes or labels the AI might add
    const summary = response.replace(/^["']|["']$/g, "").trim();

    // Save to users table
    await supabase
      .from("users")
      .update({ profile_summary: summary })
      .eq("id", user_id);

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Summary generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
