import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  try {
    const scrapeBody = await request.json();
    const user_id = scrapeBody.user_id as string;
    const url = scrapeBody.url as string;

    if (!user_id || !url) {
      return NextResponse.json(
        { error: "Missing user_id or url" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    await supabase
      .from("scraped_urls")
      .update({ processing_status: "processing" })
      .eq("url", url)
      .eq("user_id", user_id);

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
        // Fall back to basic fetch
      }
    }

    if (!scrapedContent) {
      try {
        const res = await fetch(url);
        scrapedContent = await res.text();
        scrapedContent = scrapedContent.replace(/<[^>]*>/g, " ").slice(0, 10000);
      } catch {
        await supabase
          .from("scraped_urls")
          .update({
            processing_status: "failed",
            error_message: "Failed to fetch URL",
          })
          .eq("url", url)
          .eq("user_id", user_id);
        return NextResponse.json(
          { error: "Failed to scrape URL" },
          { status: 500 }
        );
      }
    }

    await supabase
      .from("scraped_urls")
      .update({ scraped_content: scrapedContent })
      .eq("url", url)
      .eq("user_id", user_id);

    const aiResponse = await chatCompletion({
      model: MODELS.EXTRACTION,
      messages: [
        {
          role: "user",
          content: `Extract career profile data from this scraped web content.

## URL: ${url}
## Content:
${scrapedContent.slice(0, 8000)}

Extract any jobs, projects, education, awards, or certifications mentioned.
Respond in JSON format:
{
  "entries": [
    {
      "entry_type": "job|project|education|award|certification",
      "company_name": "string or null",
      "job_title": "string or null",
      "date_start": "YYYY-MM-DD or null",
      "date_end": "YYYY-MM-DD or null",
      "industry": "string or null",
      "domain": "string or null",
      "chunks": ["description 1", "description 2"]
    }
  ]
}

If no career data is found, return {"entries": []}.
Return ONLY valid JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(aiResponse);

    for (const entry of parsed.entries) {
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
          source: "url_scrape",
        })
        .select()
        .single();

      if (!newEntry) continue;

      for (const chunkText of entry.chunks) {
        await supabase.from("profile_chunks").insert({
          user_id,
          entry_id: newEntry.id,
          chunk_text: chunkText,
          company_name: entry.company_name,
          job_title: entry.job_title,
          date_start: entry.date_start,
          date_end: entry.date_end,
          industry: entry.industry,
          domain: entry.domain,
          entry_type: entry.entry_type,
          source: "url_scrape",
        });
      }
    }

    await supabase
      .from("scraped_urls")
      .update({ processing_status: "completed" })
      .eq("url", url)
      .eq("user_id", user_id);

    return NextResponse.json({
      success: true,
      entries_found: parsed.entries.length,
    });
  } catch (err) {
    console.error("Scrape error:", err);
    return NextResponse.json(
      { error: "Scraping failed" },
      { status: 500 }
    );
  }
}
