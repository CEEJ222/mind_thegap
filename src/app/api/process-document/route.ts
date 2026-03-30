import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";
import mammoth from "mammoth";

interface EntryInfo {
  id?: string;
  company_name: string;
  job_title: string;
  entry_type: string;
  date_start: string | null;
  date_end: string | null;
}

// Normalize a string for fuzzy comparison
function normalize(s: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Check if one string contains the other or they share a significant word
function companyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check if the first significant word matches (e.g. "SENSER" matches "SENSER (aka Survey Insights)")
  const wordsA = na.split(" ").filter(w => w.length > 2);
  const wordsB = nb.split(" ").filter(w => w.length > 2);
  if (wordsA[0] && wordsB[0] && wordsA[0] === wordsB[0]) return true;
  return false;
}

// Check if two date ranges overlap (with 6-month buffer for near-adjacent roles)
function datesOverlap(a: EntryInfo, b: EntryInfo): boolean {
  // If either has no dates, can't determine overlap — treat as potential match
  if (!a.date_start && !b.date_start) return true;
  if (!a.date_start || !b.date_start) return true;

  const SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000;

  const aStart = new Date(a.date_start).getTime();
  const aEnd = a.date_end ? new Date(a.date_end).getTime() : Date.now();
  const bStart = new Date(b.date_start).getTime();
  const bEnd = b.date_end ? new Date(b.date_end).getTime() : Date.now();

  // Standard overlap check with 6-month buffer on each side
  return (aStart - SIX_MONTHS) <= bEnd && (bStart - SIX_MONTHS) <= aEnd;
}

// Find the best matching existing entry for a new entry
function findMatch(newEntry: EntryInfo, existingEntries: EntryInfo[]): string | null {
  // Skills/certifications: match on company name only
  if (newEntry.entry_type === "skills" || newEntry.entry_type === "certification") {
    const match = existingEntries.find(e =>
      (e.entry_type === "skills" || e.entry_type === "certification") &&
      companyMatch(e.company_name, newEntry.company_name)
    );
    return match?.id ?? null;
  }

  // Education: match on company (school) name only — don't worry about dates
  if (newEntry.entry_type === "education") {
    const match = existingEntries.find(e =>
      e.entry_type === "education" &&
      companyMatch(e.company_name, newEntry.company_name)
    );
    return match?.id ?? null;
  }

  // For jobs and projects: match on company name + overlapping dates
  // Allow cross-type matching (job can match project at same company if dates overlap)
  const sameCompany = existingEntries.filter(e =>
    (e.entry_type === "job" || e.entry_type === "project") &&
    (newEntry.entry_type === "job" || newEntry.entry_type === "project") &&
    companyMatch(e.company_name, newEntry.company_name)
  );

  if (sameCompany.length === 0) return null;

  // Check for date overlap among same-company entries
  const overlapping = sameCompany.filter(e => datesOverlap(e, newEntry));

  if (overlapping.length === 0) return null;

  // If there are overlapping entries, pick the best one:
  // 1. Prefer exact title match
  // 2. Prefer title keyword match
  // 3. Fall back to the one with the most date overlap
  const nt = normalize(newEntry.job_title);

  // Exact normalized title match
  const exactTitle = overlapping.find(e => normalize(e.job_title) === nt);
  if (exactTitle) return exactTitle.id ?? null;

  // Keyword match (share a significant word like "director", "manager", "product")
  const keywordMatch = overlapping.find(e => {
    const et = normalize(e.job_title);
    if (!nt || !et) return false;
    const newWords = nt.split(" ").filter(w => w.length > 3);
    const existWords = et.split(" ").filter(w => w.length > 3);
    return newWords.some(w => existWords.includes(w));
  });
  if (keywordMatch) return keywordMatch.id ?? null;

  // No title match — just pick the first overlapping entry at this company
  // This handles cases like "Senior PM → Director" matching either role
  return overlapping[0].id ?? null;
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

    // Step 1: Fetch existing entries FIRST so we can tell the AI about them
    const { data: existingEntries } = await supabase
      .from("profile_entries")
      .select("id, company_name, job_title, entry_type, date_start, date_end, user_confirmed")
      .eq("user_id", user_id);

    // Build a list of existing entry names for the AI to match against
    const existingNames = (existingEntries ?? [])
      .map((e: Record<string, string>) =>
        `- ${e.company_name}${e.job_title ? ` (${e.job_title})` : ""} [${e.entry_type}]`
      )
      .join("\n");

    // Step 2: Extract entries from document
    const aiResponse = await chatCompletion({
      model: MODELS.EXTRACTION,
      messages: [
        {
          role: "user",
          content: `You are an expert resume/document parser. Extract structured career profile data from this document.

## Document: ${file_name || "Pasted content"}
## Content:
${text}
${existingNames ? `
## Existing Profile Entries (use these names when the content refers to the same company/project)
${existingNames}

IMPORTANT: If the document describes work at a company or project that matches one of the existing entries above, you MUST use the EXACT same company_name from the existing entry. For example, if "SENSER" exists and the document mentions "Survey Insights (now SENSER)" or describes SENSER's product, use "SENSER" as the company_name. Do NOT invent new names like "Personal Project" — use the actual project/company name.
` : ""}
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

    const existingList: EntryInfo[] = (existingEntries ?? []).map((e: Record<string, string>) => ({
      id: e.id,
      company_name: e.company_name || "",
      job_title: e.job_title || "",
      entry_type: e.entry_type || "",
      date_start: e.date_start,
      date_end: e.date_end,
    }));

    // Step 3: Match and insert/merge each entry
    for (const entry of parsed.entries) {
      const matchId = findMatch(
        {
          company_name: entry.company_name || "",
          job_title: entry.job_title || "",
          entry_type: entry.entry_type || "",
          date_start: entry.date_start,
          date_end: entry.date_end,
        },
        existingList
      );

      let entryId: string;
      // Use the matched entry's metadata for chunk denormalization, not the AI-extracted names
      let chunkMeta = {
        company_name: entry.company_name,
        job_title: entry.job_title,
        date_start: entry.date_start,
        date_end: entry.date_end,
        entry_type: entry.entry_type,
      };

      if (matchId) {
        // Matched existing entry — merge chunks into it
        entryId = matchId;
        // Use the existing entry's metadata so chunks stay in sync
        const matched = existingList.find(e => e.id === matchId);
        if (matched) {
          chunkMeta = {
            company_name: matched.company_name,
            job_title: matched.job_title,
            date_start: matched.date_start,
            date_end: matched.date_end,
            entry_type: matched.entry_type,
          };
        }
      } else {
        // No match — create new entry
        entryId = await createNewEntry(supabase, user_id, entry, docId);
        // Add to existing list so subsequent entries in this batch can match against it
        existingList.push({
          id: entryId,
          company_name: entry.company_name || "",
          job_title: entry.job_title || "",
          entry_type: entry.entry_type || "",
          date_start: entry.date_start,
          date_end: entry.date_end,
        });
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
            company_name: chunkMeta.company_name,
            job_title: chunkMeta.job_title,
            date_start: chunkMeta.date_start,
            date_end: chunkMeta.date_end,
            industry: entry.industry,
            domain: entry.domain,
            entry_type: chunkMeta.entry_type,
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
