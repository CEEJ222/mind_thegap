import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuthedUser } from "@/lib/api-auth";
import { chatCompletion, MODELS } from "@/lib/openrouter";
import { createEmbeddingsForTexts } from "@/lib/embeddings";
import { matchNearestProfileChunkIds } from "@/lib/profile-chunk-retrieval";

const PROMPT_VERSION = "aq-v2";

interface LLMResponse {
  answer: string;
  used_chunk_ids?: string[];
  confidence?: number;
  gaps?: string[];
}

function lengthTarget(
  length: "short" | "medium" | "long",
  word_limit: number | null
): string {
  if (word_limit && word_limit > 0) return `approximately ${word_limit} words`;
  switch (length) {
    case "short":
      return "60–90 words (2–3 tight sentences)";
    case "long":
      return "180–250 words";
    case "medium":
    default:
      return "100–150 words";
  }
}

// POST /api/application-questions/generate
// Body: { question_id }
export async function POST(request: NextRequest) {
  const auth = await requireAuthedUser(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const question_id = body.question_id as string;
  if (!question_id) {
    return NextResponse.json(
      { error: "Missing question_id" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data: q } = await supabase
    .from("application_questions")
    .select("*")
    .eq("id", question_id)
    .maybeSingle();

  if (!q || q.user_id !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: app } = await supabase
    .from("applications")
    .select("id, user_id, company_name, job_title, jd_text, jd_summary")
    .eq("id", q.application_id)
    .single();

  if (!app || app.user_id !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // --- Retrieval --------------------------------------------------------
  // Bias the retrieval query by JD title so chunks are role-relevant, not
  // just literal-question-relevant.
  const retrievalQuery = [
    q.question_text,
    app.job_title ? `Role: ${app.job_title}` : "",
    app.company_name ? `Company: ${app.company_name}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let retrievedIds: string[] = [];
  try {
    const [vec] = await createEmbeddingsForTexts([retrievalQuery]);
    retrievedIds = await matchNearestProfileChunkIds(
      supabase,
      auth.userId,
      vec,
      8
    );
  } catch (e) {
    console.error("[application-questions/generate] retrieval error:", e);
  }

  // Merge with theme-curated evidence chunks (pre-vetted for this JD).
  const { data: themes } = await supabase
    .from("application_themes")
    .select("theme_name, score_tier, evidence_chunk_ids")
    .eq("application_id", app.id);

  const themeChunkIds = new Set<string>();
  (themes ?? []).forEach((t) => {
    (t.evidence_chunk_ids ?? []).forEach((id: string) => themeChunkIds.add(id));
  });

  const mergedIds = Array.from(
    new Set([...retrievedIds, ...Array.from(themeChunkIds)])
  );

  let chunks: Array<{
    id: string;
    chunk_text: string;
    company_name: string | null;
    job_title: string | null;
    entry_type: string | null;
  }> = [];
  if (mergedIds.length > 0) {
    const { data } = await supabase
      .from("profile_chunks")
      .select("id, chunk_text, company_name, job_title, entry_type")
      .in("id", mergedIds);
    chunks = data ?? [];
  }

  // Latest generated resume. `editorial_notes.resume_content` holds the
  // tailored markdown — feeding that in is the biggest lever for specific,
  // non-generic answers.
  const { data: latestResume } = await supabase
    .from("generated_resumes")
    .select("id, version, editorial_notes, created_at")
    .eq("application_id", app.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const resumeContent =
    (latestResume?.editorial_notes as Record<string, unknown> | null)?.[
      "resume_content"
    ];
  const resumeMd =
    typeof resumeContent === "string" ? resumeContent.slice(0, 8000) : "";

  // --- Prompt -----------------------------------------------------------
  const chunkBlock = chunks.length
    ? chunks
        .map(
          (c) =>
            `[id:${c.id}] [${c.entry_type ?? "entry"} | ${c.company_name ?? "—"} | ${c.job_title ?? "—"}] ${c.chunk_text}`
        )
        .join("\n")
    : "(no matching profile evidence)";

  const target = lengthTarget(q.answer_length, q.word_limit);
  const tonePart = q.tone ? `Tone: ${q.tone}.` : "Tone: confident, specific, plain.";

  const systemPrompt = `You write first-person screening-question answers for a candidate applying to a specific job. Your goal is a SPECIFIC, HIGH-SIGNAL answer — not a resume summary, not a cover-letter paragraph.

HARD RULES
- Ground every claim in the supplied evidence (resume, chunks, JD). Do not invent employers, tools, metrics, headcounts, timeframes, or outcomes.
- Use concrete nouns: product names, user segments, specific regulations (e.g. "HIPAA", "Lifeline"), specific technologies. Prefer names over categories.
- Include real numbers from the evidence (%, $, users, time, team size). Do not round up or invent numbers — if a metric isn't in evidence, omit it.
- If the question asks for multiple things (e.g. "describe X AND what results"), cover each part.
- For long/medium answers, follow a light STAR arc: situation → what YOU did → outcome. Skip the labels; just write it. For short answers, drop straight into the "what I did" + outcome.

BANNED PHRASES (do not use any form of these — rewrite around them)
- "comprehensive", "strategic", "cross-functional", "leveraged", "spearheaded",
  "robust", "seamless", "holistic", "synergy", "stakeholders" (use the specific
  role instead), "full product lifecycle" (name the phases you did),
  "business objectives" (name the objective), "end-to-end".
- No opener fluff: "I'm excited to…", "I have experience with…", "I'd be a great fit…". Start with the story.

VOICE
- First person, past tense for completed work.
- Plain, declarative sentences. No marketing register.
- ${tonePart}

LENGTH
- Target: ${target}. Count words before finishing. Trim filler before trimming substance.

OUTPUT
- Respond with ONLY valid JSON, no markdown fences.
- "used_chunk_ids" must be a subset of the chunk ids shown in evidence; only list ids whose content you actually drew from.
- "gaps" lists specific facts the question asked for that you couldn't find in evidence (e.g. "no revenue numbers for the CRM launch", "no HIPAA audit result"). Empty array if none.`;

  const userPrompt = `## Question
${q.question_text}

## Job
${app.company_name ?? ""} — ${app.job_title ?? ""}

## JD summary
${app.jd_summary ?? "(none)"}

## JD (truncated)
${(app.jd_text ?? "").slice(0, 2500)}

## Tailored resume for this role (source of truth for specific bullets)
${resumeMd || "(no generated resume available)"}

## Additional profile evidence chunks (cite ids if used)
${chunkBlock}

## Output JSON shape
{
  "answer": "string (first person, target length)",
  "used_chunk_ids": ["<uuid>", ...],
  "confidence": 0.0-1.0,
  "gaps": ["short description of missing info", ...]
}`;

  let parsed: LLMResponse;
  try {
    const text = await chatCompletion({
      model: MODELS.PREMIUM,
      max_tokens: 1600,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    parsed = JSON.parse(text) as LLMResponse;
  } catch (e) {
    console.error("[application-questions/generate] LLM error:", e);
    return NextResponse.json(
      { error: "Failed to generate answer" },
      { status: 502 }
    );
  }

  const allowedIdSet = new Set(chunks.map((c) => c.id));
  const usedIds = (parsed.used_chunk_ids ?? []).filter((id) =>
    allowedIdSet.has(id)
  );

  const { data: saved, error: updateErr } = await supabase
    .from("application_questions")
    .update({
      answer_text: (parsed.answer ?? "").trim(),
      source_chunk_ids: usedIds,
      source_resume_id: latestResume?.id ?? null,
      model: MODELS.PREMIUM,
      prompt_version: PROMPT_VERSION,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 8) : [],
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : null,
    })
    .eq("id", question_id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    question: saved,
    sources: chunks.filter((c) => usedIds.includes(c.id)),
  });
}
