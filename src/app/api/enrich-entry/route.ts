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
          content: `Extract company/project information from this URL to enrich a profile entry.

## Profile Entry
Company/Project: ${entry.company_name}
Title: ${entry.job_title}
Type: ${entry.entry_type}

## Scraped URL Content (${url})
${scrapedContent.slice(0, 6000)}

## Instructions
Extract the following from the URL content:
1. company_description — A concise 1-2 sentence description of what this company or project IS and DOES. This should explain the business to someone who has never heard of it. For example: "Mobile-first telecommunications platform providing affordable wireless service to 2M+ subscribers through government subsidy programs." Do NOT describe what the person did there — describe what the company/project itself is.
2. industry — what industry? (e.g. Telecommunications, Healthcare, SaaS, etc.)
3. domain — what business domain? (e.g. Mobile, Enterprise, Consumer, B2B, eCommerce, etc.)

Return JSON only:
{
  "company_description": "string or null",
  "industry": "string or null",
  "domain": "string or null"
}

Return ONLY valid JSON.`,
        },
      ],
    });

    const enrichment = JSON.parse(response);

    // Update entry metadata and description
    const updates: Record<string, string> = {};
    if (enrichment.company_description) updates.company_description = enrichment.company_description;
    if (enrichment.industry && !entry.industry) updates.industry = enrichment.industry;
    if (enrichment.domain && !entry.domain) updates.domain = enrichment.domain;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("profile_entries")
        .update(updates)
        .eq("id", entry_id);
    }

    return NextResponse.json({
      success: true,
      company_description: enrichment.company_description,
      industry: enrichment.industry,
      domain: enrichment.domain,
    });
  } catch (err) {
    console.error("Enrich entry error:", err);
    return NextResponse.json(
      { error: "Enrichment failed" },
      { status: 500 }
    );
  }
}
