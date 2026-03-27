import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry_id = body.entry_id as string;
    const url = body.url as string;

    if (!entry_id || !url) {
      return NextResponse.json(
        { error: "Missing entry_id or url" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get the entry
    const { data: entry } = await supabase
      .from("profile_entries")
      .select("*")
      .eq("id", entry_id)
      .single();

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Scrape the URL
    let scrapedContent = "";

    if (process.env.FIRECRAWL_API_KEY) {
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({ url, formats: ["markdown"] }),
        });
        const data = await res.json();
        scrapedContent = data.data?.markdown || data.data?.content || "";
      } catch {
        // Fall back
      }
    }

    if (!scrapedContent) {
      try {
        const res = await fetch(url);
        scrapedContent = await res.text();
        scrapedContent = scrapedContent.replace(/<[^>]*>/g, " ").slice(0, 15000);
      } catch {
        return NextResponse.json(
          { error: "Failed to fetch URL" },
          { status: 500 }
        );
      }
    }

    // Ask AI to extract enrichment data from the URL
    const response = await chatCompletion({
      model: MODELS.LIGHT,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Extract information from this URL to enrich a profile entry.

## Profile Entry
Company: ${entry.company_name}
Title: ${entry.job_title}
Type: ${entry.entry_type}

## Scraped URL Content (${url})
${scrapedContent.slice(0, 6000)}

## Instructions
Extract any of the following that can be determined from the URL content:
1. industry — what industry is this company/project in?
2. domain — what business domain? (e.g. SaaS, Mobile, Healthcare, eCommerce)
3. additional_bullets — any new achievements, features, or details about this role/project that aren't obvious from a resume. Extract as specific bullet points.

Return JSON only:
{
  "industry": "string or null",
  "domain": "string or null",
  "additional_bullets": ["bullet 1", "bullet 2"]
}

If nothing useful can be extracted, return {"industry": null, "domain": null, "additional_bullets": []}.
Return ONLY valid JSON.`,
        },
      ],
    });

    const enrichment = JSON.parse(response);

    // Update entry metadata
    const updates: Record<string, string> = {};
    if (enrichment.industry && !entry.industry) updates.industry = enrichment.industry;
    if (enrichment.domain && !entry.domain) updates.domain = enrichment.domain;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("profile_entries")
        .update(updates)
        .eq("id", entry_id);
    }

    // Add new bullets as chunks (with dedup)
    if (enrichment.additional_bullets?.length > 0) {
      const { data: existingChunks } = await supabase
        .from("profile_chunks")
        .select("chunk_text")
        .eq("entry_id", entry_id);

      const existingTexts = new Set(
        (existingChunks ?? []).map((c: Record<string, string>) =>
          c.chunk_text.toLowerCase().trim()
        )
      );

      for (const bullet of enrichment.additional_bullets) {
        if (!existingTexts.has(bullet.toLowerCase().trim())) {
          await supabase.from("profile_chunks").insert({
            user_id: entry.user_id,
            entry_id,
            chunk_text: bullet,
            company_name: entry.company_name,
            job_title: entry.job_title,
            date_start: entry.date_start,
            date_end: entry.date_end,
            entry_type: entry.entry_type,
            source: "url_scrape",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      industry: enrichment.industry,
      domain: enrichment.domain,
      bullets_added: enrichment.additional_bullets?.length ?? 0,
    });
  } catch (err) {
    console.error("Enrich entry error:", err);
    return NextResponse.json(
      { error: "Enrichment failed" },
      { status: 500 }
    );
  }
}
