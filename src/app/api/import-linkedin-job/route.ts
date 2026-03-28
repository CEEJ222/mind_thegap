import { NextRequest, NextResponse } from "next/server";

function extractJobId(url: string): string | null {
  // Match /jobs/view/1234567890 (with optional slug before ID)
  // Also match currentJobId=1234567890 query param
  const match = url.match(
    /(?:currentJobId=|jobs\/view\/(?:[^/]*?-)?(?=\d))(\d+)|jobs\/view\/(\d+)/
  );
  return match?.[1] || match?.[2] || null;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/ul>/gi, "\n")
    .replace(/<\/ol>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // SSRF guard — only allow LinkedIn URLs
    if (!url.includes("linkedin.com")) {
      return NextResponse.json(
        {
          error:
            "That doesn't look like a LinkedIn job URL. Please use a URL from linkedin.com/jobs/view/...",
        },
        { status: 400 }
      );
    }

    const jobId = extractJobId(url);
    if (!jobId) {
      return NextResponse.json(
        {
          error:
            "Could not extract job ID from URL. Please paste the job description manually.",
        },
        { status: 400 }
      );
    }

    const guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;

    let html: string;
    try {
      const res = await fetch(guestUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              "Could not fetch job details. LinkedIn may be blocking this request. Please paste the job description manually.",
          },
          { status: 422 }
        );
      }

      html = await res.text();
    } catch {
      return NextResponse.json(
        {
          error:
            "Could not fetch job details. Please paste the job description manually.",
        },
        { status: 422 }
      );
    }

    // Extract title
    const titleMatch = html.match(
      /<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i
    ) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? htmlToPlainText(titleMatch[1]).replace(/ \| LinkedIn$/, "").trim()
      : null;

    // Extract company name
    const companyMatch = html.match(
      /<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i
    ) || html.match(/<a[^>]*class="[^"]*top-card-layout__company-url[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const company = companyMatch ? htmlToPlainText(companyMatch[1]).trim() : null;

    // Extract location
    const locationMatch = html.match(
      /<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    );
    const location = locationMatch ? htmlToPlainText(locationMatch[1]).trim() : null;

    // Extract description — try multiple selectors
    const descMatch =
      html.match(/<div[^>]*class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
      html.match(/<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i) ||
      html.match(/<div[^>]*id="job-details"[^>]*>([\s\S]*?)<\/div>/i);

    let description = descMatch ? htmlToPlainText(descMatch[1]) : null;

    if (description) {
      const cutoffPhrases = [
        "Show more",
        "Show less",
        "Seniority level",
        "Employment type",
        "Referrals increase your chances",
        "See who you know",
        "is an equal opportunity employer",
        "equal opportunity employer",
        "EEO being the law",
        "qualified applicants will receive consideration",
      ];
      for (const phrase of cutoffPhrases) {
        const idx = description.indexOf(phrase);
        if (idx !== -1) {
          description = description.substring(0, idx).trim();
          break;
        }
      }
    }

    if (!description || description.length < 50) {
      return NextResponse.json(
        {
          error:
            "Could not extract job description. LinkedIn may have changed their page structure. Please paste the job description manually.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      jobId,
      title,
      company,
      location,
      description,
      linkedinUrl: `https://www.linkedin.com/jobs/view/${jobId}`,
    });
  } catch (err) {
    console.error("Import LinkedIn job error:", err);
    return NextResponse.json(
      { error: "Failed to import job. Please paste the job description manually." },
      { status: 500 }
    );
  }
}
