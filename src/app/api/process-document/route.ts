import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";
import mammoth from "mammoth";

// Ask AI to match new entries against existing ones
async function fuzzyMatchEntries(
  newEntries: { company_name: string; job_title: string; entry_type: string; date_start: string | null; date_end: string | null }[],
  existingEntries: { id: string; company_name: string; job_title: string; entry_type: string; date_start: string | null; date_end: string | null }[]
): Promise<Record<number, string | null>> {
  if (existingEntries.length === 0) {
    // No existing entries — everything is new
    const result: Record<number, string | null> = {};
    newEntries.forEach((_, i) => { result[i] = null; });
    return result;
  }

  const existingList = existingEntries
    .map((e, i) => `  [${i}] "${e.company_name}" | "${e.job_title}" | ${e.entry_type} | ${e.date_start ?? "?"} – ${e.date_end ?? "present"}`)
    .join("\n");

  const newList = newEntries
    .map((e, i) => `  [${i}] "${e.company_name}" | "${e.job_title}" | ${e.entry_type} | ${e.date_start ?? "?"} – ${e.date_end ?? "present"}`)
    .join("\n");

  const response = await chatCompletion({
    model: MODELS.LIGHT,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Match new entries to existing profile entries. Two entries match if they refer to the SAME role at the SAME company, even if:
- Job titles differ slightly ("Product Manager" vs "Product Manager — CRM" vs "Senior Technical PM — Oracle EPM")
- Company names differ slightly ("SENSER" vs "SENSER (aka Survey Insights)")
- Date ranges overlap or are close

They do NOT match if they are clearly different roles at the same company (e.g. "Director" vs "Senior PM" with different date ranges).

## Existing entries:
${existingList}

## New entries to match:
${newList}

For each new entry index, return the existing entry index it matches, or null if it's new.

Return ONLY a JSON object mapping new index to existing index or null:
{"0": 2, "1": null, "2": 5, "3": null}`,
      },
    ],
  });

  return JSON.parse(response);
}

export async function POST(request: NextRequest) {
  try {
    const docBody = await request.json();
    const user_id = docBody.user_id as string;
    const file_path = docBody.file_path as string | undefined;
    const file_name = docBody.file_name as string | undefined;
    const document_id = docBody.document_id as string | undefined;
    const pasted_text = docBody.pasted_text as string | undefined;

    if (!user_id || (!file_path && !pasted_text)) {
      return NextResponse.json(
        { error: "Missing user_id or content" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    let text: string;
    let docId = document_id;

    if (pasted_text) {
      text = pasted_text;
    } else {
      if (!docId && file_path) {
        const { data: doc } = await supabase
          .from("uploaded_documents")
          .select("id")
          .eq("file_path", file_path)
          .single();
        docId = doc?.id;
      }

      if (file_path) {
        await supabase
          .from("uploaded_documents")
          .update({ processing_status: "processing" })
          .eq("file_path", file_path);
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("documents")
        .download(file_path!);

      if (downloadError || !fileData) {
        if (file_path) {
          await supabase
            .from("uploaded_documents")
            .update({
              processing_status: "failed",
              error_message: "Failed to download file",
            })
            .eq("file_path", file_path);
        }
        return NextResponse.json(
          { error: "Failed to download file" },
          { status: 500 }
        );
      }

      const isDocx = (file_name || "").toLowerCase().endsWith(".docx") ||
        (file_path || "").toLowerCase().endsWith(".docx");

      if (isDocx) {
        const arrayBuffer = await fileData.arrayBuffer();
        const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
        text = result.value;
      } else {
        text = await fileData.text();
      }
    }

    // Step 1: Extract entries from document
    const aiResponse = await chatCompletion({
      model: MODELS.EXTRACTION,
      messages: [
        {
          role: "user",
          content: `You are an expert resume/document parser. Extract structured career profile data from this document.

## Document: ${file_name || "Pasted content"}
## Content:
${text}

## Instructions
1. Classify the document type: resume, project_writeup, biz_case, award, certification, performance_review, or other.
2. Extract each distinct job, project, education entry, award, or certification.
3. IMPORTANT: If the same company appears with DIFFERENT job titles or date ranges, create SEPARATE entries for each role. For example, "Senior PM at Acme (2022-2023)" and "Director at Acme (2024-present)" must be two separate entries, not merged.
4. For each entry, extract: entry_type (job/project/education/award/certification|skills), company_name, job_title, date_start (YYYY-MM-DD), date_end (YYYY-MM-DD or null if current), industry, domain.
5. DATES: Use EXACTLY what is written in the document. If it says "January 2024", use "2024-01-01". If it says just "2023", use "2023-01-01". If it says "2018 – 2023", use start "2018-01-01" and end "2023-12-31". Do NOT guess or shift dates. If it says "Present" or is the current role, use null for date_end.
6. For each entry, extract individual bullet points/achievements as separate chunks. Only include bullets that belong to THAT specific role.
7. Extract a skills entry with entry_type "skills", company_name "Skills & Expertise", and job_title "Skills". Set BOTH date_start and date_end to null. Put each skill category as a separate chunk (e.g. "Product: User Story Creation, Roadmap Development, Agile/Scrum").

Respond in this exact JSON format:
{
  "document_type": "string",
  "entries": [
    {
      "entry_type": "job|project|education|award|certification|skills",
      "company_name": "string",
      "job_title": "string",
      "date_start": "YYYY-MM-DD or null",
      "date_end": "YYYY-MM-DD or null",
      "industry": "string or null",
      "domain": "string or null",
      "chunks": ["bullet point 1", "bullet point 2"]
    }
  ]
}

Return ONLY valid JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(aiResponse);

    if (file_path) {
      await supabase
        .from("uploaded_documents")
        .update({ document_type: parsed.document_type })
        .eq("file_path", file_path);
    }

    // Step 2: Get existing entries for fuzzy matching
    const { data: existingEntries } = await supabase
      .from("profile_entries")
      .select("id, company_name, job_title, entry_type, date_start, date_end")
      .eq("user_id", user_id);

    // Step 3: AI fuzzy match new entries against existing ones
    const matchMap = await fuzzyMatchEntries(
      parsed.entries.map((e: Record<string, string | null>) => ({
        company_name: e.company_name,
        job_title: e.job_title,
        entry_type: e.entry_type,
        date_start: e.date_start,
        date_end: e.date_end,
      })),
      (existingEntries ?? []).map((e: Record<string, string>) => ({
        id: e.id,
        company_name: e.company_name,
        job_title: e.job_title,
        entry_type: e.entry_type,
        date_start: e.date_start,
        date_end: e.date_end,
      }))
    );

    // Step 4: Insert or merge entries based on match results
    for (let i = 0; i < parsed.entries.length; i++) {
      const entry = parsed.entries[i];
      const matchedExistingIndex = matchMap[i];

      let entryId: string;

      if (matchedExistingIndex !== null && matchedExistingIndex !== undefined && existingEntries) {
        // Matched an existing entry — merge chunks into it
        const matchedEntry = existingEntries[matchedExistingIndex];
        if (matchedEntry) {
          entryId = matchedEntry.id;
        } else {
          // Bad match index — create new
          entryId = await createNewEntry(supabase, user_id, entry, docId);
        }
      } else {
        // No match — create new entry
        entryId = await createNewEntry(supabase, user_id, entry, docId);
      }

      // Insert chunks with dedup (exact text match)
      for (const chunkText of entry.chunks) {
        const { data: existingChunks } = await supabase
          .from("profile_chunks")
          .select("chunk_text")
          .eq("entry_id", entryId);

        const isDuplicate = existingChunks?.some(
          (ec: Record<string, string>) =>
            ec.chunk_text.toLowerCase().trim() ===
            chunkText.toLowerCase().trim()
        );

        if (!isDuplicate) {
          await supabase.from("profile_chunks").insert({
            user_id,
            entry_id: entryId,
            chunk_text: chunkText,
            company_name: entry.company_name,
            job_title: entry.job_title,
            date_start: entry.date_start,
            date_end: entry.date_end,
            industry: entry.industry,
            domain: entry.domain,
            entry_type: entry.entry_type,
            source: "resume_upload",
          });
        }
      }
    }

    // Mark document as completed
    if (file_path) {
      await supabase
        .from("uploaded_documents")
        .update({ processing_status: "completed" })
        .eq("file_path", file_path);
    } else if (docId) {
      await supabase
        .from("uploaded_documents")
        .update({ processing_status: "completed" })
        .eq("id", docId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Document processing error:", err);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}

// Helper: create a new profile entry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createNewEntry(supabase: any, user_id: string, entry: any, docId: string | undefined): Promise<string> {
  const insertData: Record<string, string | boolean | null> = {
    user_id,
    entry_type: entry.entry_type,
    company_name: entry.company_name,
    job_title: entry.job_title,
    date_start: entry.date_start,
    date_end: entry.date_end,
    industry: entry.industry,
    domain: entry.domain,
    source: "resume_upload",
  };

  if (docId) {
    insertData.source_document_id = docId;
  }

  const { data: newEntry } = await supabase
    .from("profile_entries")
    .insert(insertData)
    .select()
    .single();

  return newEntry?.id ?? "";
}
