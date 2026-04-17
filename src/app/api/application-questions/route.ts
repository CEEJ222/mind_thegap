import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuthedUser } from "@/lib/api-auth";

// GET /api/application-questions?application_id=...
export async function GET(request: NextRequest) {
  const auth = await requireAuthedUser(request);
  if (auth instanceof NextResponse) return auth;

  const application_id = request.nextUrl.searchParams.get("application_id");
  if (!application_id) {
    return NextResponse.json(
      { error: "Missing application_id" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Ownership check
  const { data: app } = await supabase
    .from("applications")
    .select("id, user_id")
    .eq("id", application_id)
    .maybeSingle();
  if (!app || app.user_id !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("application_questions")
    .select("*")
    .eq("application_id", application_id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ questions: data ?? [] });
}

// POST /api/application-questions
// Body: { application_id, questions: Array<{ question_text, answer_length?, tone?, word_limit? }> }
export async function POST(request: NextRequest) {
  const auth = await requireAuthedUser(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const application_id = body.application_id as string;
  const questions = body.questions as Array<{
    question_text: string;
    answer_length?: "short" | "medium" | "long";
    tone?: string | null;
    word_limit?: number | null;
  }>;

  if (!application_id || !Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json(
      { error: "Missing application_id or questions" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data: app } = await supabase
    .from("applications")
    .select("id, user_id")
    .eq("id", application_id)
    .maybeSingle();
  if (!app || app.user_id !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Append to the end — position = current max + 1, + 1 per new question
  const { data: existing } = await supabase
    .from("application_questions")
    .select("position")
    .eq("application_id", application_id)
    .order("position", { ascending: false })
    .limit(1);
  const basePos = existing && existing[0] ? existing[0].position + 1 : 0;

  const rows = questions
    .map((q, i) => ({
      user_id: auth.userId,
      application_id,
      question_text: (q.question_text || "").trim(),
      answer_length: q.answer_length ?? "medium",
      tone: q.tone ?? null,
      word_limit: q.word_limit ?? null,
      position: basePos + i,
    }))
    .filter((r) => r.question_text.length > 0);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No non-empty questions" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("application_questions")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ questions: data ?? [] });
}

// PATCH /api/application-questions
// Body: { id, answer_text?, answer_length?, tone?, word_limit?, question_text? }
export async function PATCH(request: NextRequest) {
  const auth = await requireAuthedUser(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("application_questions")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.user_id !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = [
    "answer_text",
    "answer_length",
    "tone",
    "word_limit",
    "question_text",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("application_questions")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ question: data });
}

// DELETE /api/application-questions?id=...
export async function DELETE(request: NextRequest) {
  const auth = await requireAuthedUser(request);
  if (auth instanceof NextResponse) return auth;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("application_questions")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.user_id !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("application_questions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
