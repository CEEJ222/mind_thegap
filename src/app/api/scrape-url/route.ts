import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, MODELS } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  try {
    const scrapeBody = await request.json();
    const user_id = scrapeBody.user_id as string;
    const url = scrapeBody.url as string;
    const url_type = scrapeBody.url_type as string | undefined;

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

    // Step 1: Scrape the URL content
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
        scrapedContent = scrapedContent.replace(/<[^>]*>/g, " ").slice(0, 15000);
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

    // Save scraped content
    await supabase
      .from("scraped_urls")
      .update({ scraped_content: scrapedContent })
      .eq("url", url)
      .eq("user_id", user_id);

    // Step 2: Handle based on URL type
    if (url_type === "employer") {
      // Employer URL: extract company info and enrich existing profile entries
      await handleEmployerUrl(supabase, user_id, url, scrapedContent);
    } else {
      // Portfolio/project/personal: extract career data through document processor
      const { data: docRecord } = await supabase
        .from("uploaded_documents")
        .insert({
          user_id,
          file_name: `Link: ${url}`,
          file_path: `scraped/${user_id}/${Date.now()}`,
          file_type: "text/html",
          document_type: "other",
          processing_status: "processing",
        })
        .select("id")
        .single();

      const origin = request.headers.get("origin") || request.headers.get("host") || "http://localhost:3000";
      const baseUrl = origin.startsWith("http") ? origin : `http://${origin}`;

      await fetch(`${baseUrl}/api/process-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id,
          pasted_text: scrapedContent.slice(0, 10000),
          document_id: docRecord?.id,
        }),
      });
    }

    // Mark URL as completed
    await supabase
      .from("scraped_urls")
      .update({ processing_status: "completed" })
      .eq("url", url)
      .eq("user_id", user_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Scrape error:", err);
    return NextResponse.json(
      { error: "Scraping failed" },
      { status: 500 }
    );
  }
}

// Handle employer URL: extract company metadata and enrich matching profile entries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEmployerUrl(supabase: any, user_id: string, url: string, content: string) {
  // Ask AI to extract company info from the employer website
  const response = await chatCompletion({
    model: MODELS.LIGHT,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extract company information from this employer website.

## URL: ${url}
## Content:
${content.slice(0, 6000)}

Return a JSON object with:
{
  "company_name": "The company name",
  "industry": "The industry (e.g. Telecommunications, Healthcare, SaaS, etc.)",
  "domain": "The business domain (e.g. Mobile, Enterprise, Consumer, B2B, etc.)",
  "description": "One sentence description of what the company does"
}

Return ONLY valid JSON.`,
      },
    ],
  });

  const companyInfo = JSON.parse(response);

  if (!companyInfo.company_name) return;

  // Find matching profile entries by company name (fuzzy)
  const { data: entries } = await supabase
    .from("profile_entries")
    .select("id, company_name")
    .eq("user_id", user_id);

  if (!entries) return;

  const normalizedCompany = companyInfo.company_name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  for (const entry of entries) {
    const normalizedEntry = (entry.company_name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    // Match if company names are similar
    const isMatch =
      normalizedEntry === normalizedCompany ||
      normalizedEntry.includes(normalizedCompany) ||
      normalizedCompany.includes(normalizedEntry) ||
      (normalizedEntry.split(" ")[0]?.length > 2 &&
        normalizedEntry.split(" ")[0] === normalizedCompany.split(" ")[0]);

    if (isMatch) {
      // Update industry and domain on matching entries (only if not already set or not user_confirmed)
      const updates: Record<string, string> = {};
      if (companyInfo.industry) updates.industry = companyInfo.industry;
      if (companyInfo.domain) updates.domain = companyInfo.domain;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("profile_entries")
          .update(updates)
          .eq("id", entry.id)
          .eq("user_confirmed", false); // Don't overwrite user-confirmed entries
      }
    }
  }
}
