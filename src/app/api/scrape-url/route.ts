import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

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

    // Get the scraped_urls record ID
    const { data: urlRecord } = await supabase
      .from("scraped_urls")
      .select("id")
      .eq("url", url)
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

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

    // Step 2: Create an uploaded_documents record so it's trackable
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

    // Step 3: Route through the document processor pipeline (same fuzzy dedup)
    const origin = request.headers.get("origin") || request.headers.get("host") || "http://localhost:3000";
    const baseUrl = origin.startsWith("http") ? origin : `http://${origin}`;

    const processRes = await fetch(`${baseUrl}/api/process-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id,
        pasted_text: scrapedContent.slice(0, 10000),
        document_id: docRecord?.id,
      }),
    });

    if (!processRes.ok) {
      throw new Error("Document processing failed");
    }

    // Mark URL as completed
    await supabase
      .from("scraped_urls")
      .update({ processing_status: "completed" })
      .eq("url", url)
      .eq("user_id", user_id);

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    console.error("Scrape error:", err);
    return NextResponse.json(
      { error: "Scraping failed" },
      { status: 500 }
    );
  }
}
