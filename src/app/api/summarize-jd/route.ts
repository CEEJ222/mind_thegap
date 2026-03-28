import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  try {
    const { application_id, jd_text } = await request.json();

    if (!application_id || !jd_text) {
      return NextResponse.json(
        { error: "Missing application_id or jd_text" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Check if already generated
    const { data: existing } = await supabase
      .from("applications")
      .select("jd_summary")
      .eq("id", application_id)
      .single();

    if (existing?.jd_summary) {
      return NextResponse.json({ summary: existing.jd_summary });
    }

    const summary = await chatCompletion({
      model: MODELS.LIGHT,
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: `Summarize this job description in 2 sentences. Focus on: what the role does day-to-day, and the 2-3 most important requirements. Be direct and specific — no filler phrases like "exciting opportunity" or "join our team". Output only the summary, no labels.

${jd_text.slice(0, 3000)}`,
        },
      ],
    });

    const clean = summary.replace(/^["']|["']$/g, "").trim();

    await supabase
      .from("applications")
      .update({ jd_summary: clean })
      .eq("id", application_id);

    return NextResponse.json({ summary: clean });
  } catch (err) {
    console.error("JD summary error:", err);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
