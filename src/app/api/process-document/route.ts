import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const docBody = await request.json();
    const user_id = docBody.user_id as string;
    const file_path = docBody.file_path as string;
    const file_name = docBody.file_name as string;

    if (!user_id || !file_path) {
      return NextResponse.json(
        { error: "Missing user_id or file_path" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Update status to processing
    await supabase
      .from("uploaded_documents")
      .update({ processing_status: "processing" })
      .eq("file_path", file_path);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(file_path);

    if (downloadError || !fileData) {
      await supabase
        .from("uploaded_documents")
        .update({
          processing_status: "failed",
          error_message: "Failed to download file",
        })
        .eq("file_path", file_path);
      return NextResponse.json(
        { error: "Failed to download file" },
        { status: 500 }
      );
    }

    // Convert to text (for text/plain files; PDF/DOCX would need additional parsing)
    const text = await fileData.text();

    // Use Claude to extract structured profile data
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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
3. For each entry, extract: entry_type (job/project/education/award/certification), company_name, job_title, date_start (YYYY-MM-DD), date_end (YYYY-MM-DD or null if current), industry, domain.
4. For each entry, extract individual bullet points/achievements as separate chunks.

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

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response");

    const parsed = JSON.parse(content.text);

    // Update document type
    await supabase
      .from("uploaded_documents")
      .update({ document_type: parsed.document_type })
      .eq("file_path", file_path);

    // Insert entries and chunks
    for (const entry of parsed.entries) {
      // Check for deduplication: same company + overlapping dates
      const { data: existing } = await supabase
        .from("profile_entries")
        .select("*")
        .eq("user_id", user_id)
        .eq("company_name", entry.company_name)
        .eq("user_confirmed", false);

      let entryId: string;
      const hasOverlap = existing?.some((e) => {
        if (!e.date_start || !entry.date_start) return false;
        return e.company_name === entry.company_name;
      });

      if (hasOverlap && existing && existing.length > 0) {
        // Merge into existing entry
        entryId = existing[0].id;
      } else {
        // Create new entry
        const { data: newEntry } = await supabase
          .from("profile_entries")
          .insert({
            user_id,
            entry_type: entry.entry_type,
            company_name: entry.company_name,
            job_title: entry.job_title,
            date_start: entry.date_start,
            date_end: entry.date_end,
            industry: entry.industry,
            domain: entry.domain,
            source: "resume_upload",
          })
          .select()
          .single();

        if (!newEntry) continue;
        entryId = newEntry.id;
      }

      // Insert chunks (with basic dedup check)
      for (const chunkText of entry.chunks) {
        const { data: existingChunks } = await supabase
          .from("profile_chunks")
          .select("chunk_text")
          .eq("entry_id", entryId);

        // Simple text similarity check - skip exact duplicates
        const isDuplicate = existingChunks?.some(
          (ec) =>
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

    // Mark as completed
    await supabase
      .from("uploaded_documents")
      .update({ processing_status: "completed" })
      .eq("file_path", file_path);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Document processing error:", err);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
