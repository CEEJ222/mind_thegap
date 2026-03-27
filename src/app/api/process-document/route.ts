import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";
import mammoth from "mammoth";

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
      // Paste & Parse mode — text provided directly, no file
      text = pasted_text;
    } else {
      // File upload mode
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

    const aiResponse = await chatCompletion({
      model: MODELS.EXTRACTION,
      messages: [
        {
          role: "user",
          content: `You are an expert resume/document parser. Extract structured career profile data from this document.

## Document: ${file_name}
## Content:
${text}

## Instructions
1. Classify the document type: resume, project_writeup, biz_case, award, certification, performance_review, or other.
2. Extract each distinct job, project, education entry, award, or certification.
3. IMPORTANT: If the same company appears with DIFFERENT job titles or date ranges, create SEPARATE entries for each role. For example, "Senior PM at Acme (2022-2023)" and "Director at Acme (2024-present)" must be two separate entries, not merged.
4. For each entry, extract: entry_type (job/project/education/award/certification), company_name, job_title, date_start (YYYY-MM-DD), date_end (YYYY-MM-DD or null if current), industry, domain.
5. DATES: Use EXACTLY what is written in the document. If it says "January 2024", use "2024-01-01". If it says just "2023", use "2023-01-01". If it says "2018 – 2023", use start "2018-01-01" and end "2023-12-31". Do NOT guess or shift dates. If it says "Present" or is the current role, use null for date_end.
6. For each entry, extract individual bullet points/achievements as separate chunks. Only include bullets that belong to THAT specific role.
7. Extract a "skills" entry with entry_type "certification" and company_name "Skills & Expertise". Set BOTH date_start and date_end to null for skills. Put each skill category as a separate chunk (e.g. "Product: User Story Creation, Roadmap Development, Agile/Scrum").

Respond in this exact JSON format:
{
  "document_type": "string",
  "entries": [
    {
      "entry_type": "job|project|education|award|certification",
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

    await supabase
      .from("uploaded_documents")
      .update({ document_type: parsed.document_type })
      .eq("file_path", file_path);

    for (const entry of parsed.entries) {
      // Dedup: check for existing entry
      // For skills/certifications: match on company_name only (job_title varies)
      // For everything else: match on company_name + job_title
      let dedupQuery = supabase
        .from("profile_entries")
        .select("*")
        .eq("user_id", user_id)
        .eq("company_name", entry.company_name)
        .eq("user_confirmed", false);

      if (entry.entry_type !== "certification") {
        dedupQuery = dedupQuery.eq("job_title", entry.job_title);
      }

      const { data: existing } = await dedupQuery;

      let entryId: string;

      if (existing && existing.length > 0) {
        // Same company + same title = same role, merge chunks
        entryId = existing[0].id;
      } else {
        // New entry
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

        // Link to source document if available
        if (docId) {
          insertData.source_document_id = docId;
        }

        const { data: newEntry } = await supabase
          .from("profile_entries")
          .insert(insertData)
          .select()
          .single();

        if (!newEntry) continue;
        entryId = newEntry.id;
      }

      // Insert chunks with dedup
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

    // Mark document as completed (works for both file uploads and pasted content)
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
