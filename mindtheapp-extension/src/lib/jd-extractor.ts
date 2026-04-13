import type {
  AppliedDetectionPayload,
  AtsType,
  JobDescriptionPayload,
} from "./types";

interface ExtractedJob {
  jdText: string;
  jobTitle: string;
  company: string;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function textFrom(selector: string, root: ParentNode = document): string {
  const el = root.querySelector(selector);
  return el ? normalizeText(el.textContent ?? "") : "";
}

function detectAts(hostname: string): AtsType {
  const h = hostname.toLowerCase();
  if (h.includes("greenhouse.io")) return "greenhouse";
  if (h.includes("lever.co")) return "lever";
  if (h.includes("ashbyhq.com")) return "ashby";
  if (h.includes("linkedin.com")) return "linkedin";
  return "generic";
}

/** Slug-to-title: "scopely-inc" → "Scopely Inc". */
function prettifySlug(slug: string): string {
  if (!slug) return "";
  return decodeURIComponent(slug)
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Pick the DOM element that looks most like a job description body.
 *
 * Modern ATS pages wrap the JD in arbitrary div hierarchies with no stable
 * class names. Heuristic: among candidate containers (main/article/section/
 * div under main/body), choose the one with the longest text content that
 * doesn't dominate the whole document (avoids picking <body> itself).
 */
function pickLargestTextBlock(root: ParentNode = document): Element | null {
  const candidates = Array.from(
    root.querySelectorAll(
      "main, article, section, [role='main'], div[class*='content'], div[class*='description'], div[class*='body']",
    ),
  );
  // Also scan all divs as a last resort — but cap to avoid O(n²) on giant DOMs.
  if (candidates.length === 0) {
    const divs = Array.from(root.querySelectorAll("div")).slice(0, 500);
    candidates.push(...divs);
  }

  let best: { el: Element; length: number } | null = null;
  for (const el of candidates) {
    const text = (el.textContent ?? "").trim();
    const len = text.length;
    if (len < 400) continue;
    // Reject elements that contain ~the entire document — those are the
    // <body> or top-level wrappers, not the JD body.
    const bodyLen = document.body?.textContent?.length ?? Infinity;
    if (len > bodyLen * 0.95) continue;
    if (!best || len > best.length) best = { el, length: len };
  }
  return best?.el ?? null;
}

function extractGreenhouse(): ExtractedJob | null {
  // Legacy boards.greenhouse.io layout.
  const legacyContainer =
    document.querySelector("#content .job-post") ??
    document.querySelector("#content");
  if (legacyContainer && (legacyContainer.textContent ?? "").length > 400) {
    const jdText = normalizeText(legacyContainer.textContent ?? "");
    const jobTitle =
      textFrom(".app-title") ||
      textFrom("h1.app-title") ||
      textFrom("h1") ||
      document.title;
    const company =
      textFrom(".company-name") ||
      textFrom("span.company-name") ||
      (document.title.split(" at ")[1] ?? "").trim() ||
      prettifySlug(location.pathname.split("/").filter(Boolean)[0] ?? "");
    return { jdText, jobTitle, company };
  }

  // Modern job-boards.greenhouse.io — React-rendered, no stable class names.
  // URL shape: https://job-boards.greenhouse.io/{companySlug}/jobs/{jobId}
  const container = pickLargestTextBlock();
  if (!container) return null;

  const jdText = normalizeText(container.textContent ?? "");
  if (jdText.length < 300) return null;

  const jobTitle =
    textFrom("h1") ||
    textFrom("h2") ||
    document.title.split(" - ")[0]?.trim() ||
    document.title;

  const pathParts = location.pathname.split("/").filter(Boolean);
  const companyFromPath = prettifySlug(pathParts[0] ?? "");
  const company =
    // Prefer a visible company header if present.
    textFrom("header h2") ||
    textFrom("[class*='company']") ||
    companyFromPath;

  return { jdText, jobTitle, company };
}

function extractLever(): ExtractedJob | null {
  const headline = document.querySelector(".posting-headline");
  const body = document.querySelector(".section-wrapper");
  if (!headline && !body) return null;

  const jdText = normalizeText(
    [headline?.textContent ?? "", body?.textContent ?? ""].join("\n"),
  );
  if (jdText.length < 50) return null;

  const jobTitle = textFrom(".posting-headline h2") || textFrom("h2") || "";
  const company =
    textFrom(".main-header-logo img[alt]") ||
    document.querySelector<HTMLImageElement>(".main-header-logo img")?.alt ||
    // Lever pages are at jobs.lever.co/{company}/...
    prettifySlug(location.pathname.split("/").filter(Boolean)[0] ?? "");

  return { jdText, jobTitle, company };
}

function extractAshby(): ExtractedJob | null {
  // Ashby renders into a React shell with dynamic class names; fall back to
  // the largest text block if the attribute selectors miss.
  const container =
    document.querySelector("[class*='_jobPostingBody']") ??
    document.querySelector("[class*='jobDescription']") ??
    pickLargestTextBlock();
  if (!container) return null;

  const jdText = normalizeText(container.textContent ?? "");
  if (jdText.length < 300) return null;

  return {
    jdText,
    jobTitle: textFrom("h1") || document.title,
    company:
      textFrom("[class*='_companyName']") ||
      prettifySlug(location.pathname.split("/").filter(Boolean)[0] ?? ""),
  };
}

function extractLinkedIn(): ExtractedJob | null {
  // TODO: LinkedIn DOM changes frequently; best-effort placeholder.
  const card = document.querySelector(".job-details-jobs-unified-top-card");
  const description =
    document.querySelector(".jobs-description__content") ??
    document.querySelector("#job-details") ??
    pickLargestTextBlock();
  if (!card && !description) return null;

  const jdText = normalizeText(
    [card?.textContent ?? "", description?.textContent ?? ""].join("\n"),
  );
  if (jdText.length < 300) return null;

  return {
    jdText,
    jobTitle:
      textFrom(".job-details-jobs-unified-top-card__job-title") ||
      textFrom("h1") ||
      "",
    company:
      textFrom(".job-details-jobs-unified-top-card__company-name") || "",
  };
}

function extractGeneric(): ExtractedJob | null {
  const container = pickLargestTextBlock();
  if (!container) return null;
  const jdText = normalizeText(container.textContent ?? "");
  if (jdText.length < 400) return null;
  return {
    jdText,
    jobTitle: textFrom("h1") || document.title,
    company: "",
  };
}

/**
 * Detect whether the current page is a post-apply confirmation page.
 * Checks URL path tokens and visible body text. Returns a payload with
 * a best-effort job URL (stripping /apply, /thanks, etc. from the path)
 * so the backend can match the same job_id the user just analyzed/saved.
 */
export function extractAppliedConfirmation(): AppliedDetectionPayload | null {
  const url = location.href.toLowerCase();
  const path = location.pathname.toLowerCase();
  const urlLookedLikeConfirmation =
    /\/(thanks|thank_?you|thank-you|confirmation|submitted|success|complete|applied)(\/|$)/.test(
      path,
    ) ||
    url.includes("application_success") ||
    url.includes("application-success") ||
    url.includes("applicationsuccess");

  const bodyText = (document.body?.textContent ?? "").toLowerCase();
  const textLookedLikeConfirmation =
    /thank\s+you\s+for\s+(your\s+application|applying)/.test(bodyText) ||
    /we[ '’]?ve\s+received\s+your\s+application/.test(bodyText) ||
    /we\s+have\s+received\s+your\s+application/.test(bodyText) ||
    /your\s+application\s+(has\s+been\s+)?(received|submitted)/.test(bodyText) ||
    /application\s+(has\s+been\s+)?(received|submitted|sent)/.test(bodyText);

  if (!urlLookedLikeConfirmation && !textLookedLikeConfirmation) return null;

  // Derive the canonical job URL by stripping trailing confirmation segments.
  let jobUrl = location.href;
  try {
    const u = new URL(location.href);
    u.pathname = u.pathname
      .replace(
        /\/(apply|thanks|thank_?you|thank-you|confirmation|submitted|success|complete|applied)\/?$/i,
        "",
      )
      // Lever: /{company}/{id}/apply/thanks
      .replace(/\/apply\/thanks\/?$/i, "");
    jobUrl = u.toString();
  } catch {
    /* ignore — fall back to current href */
  }

  const atsType = detectAts(location.hostname);
  const title =
    textFrom("h1") || (document.title.split(" - ")[0] ?? "").trim() || "";
  const pathParts = location.pathname.split("/").filter(Boolean);
  const company =
    textFrom("header h2") ||
    textFrom("[class*='company']") ||
    prettifySlug(pathParts[0] ?? "");

  return {
    pageUrl: location.href,
    jobUrl,
    title: title || undefined,
    company: company || undefined,
    atsType,
  };
}

export function extractJobDescription(): JobDescriptionPayload | null {
  const atsType = detectAts(location.hostname);
  let extracted: ExtractedJob | null = null;

  switch (atsType) {
    case "greenhouse":
      extracted = extractGreenhouse();
      break;
    case "lever":
      extracted = extractLever();
      break;
    case "ashby":
      extracted = extractAshby();
      break;
    case "linkedin":
      extracted = extractLinkedIn();
      break;
    case "generic":
      extracted = extractGeneric();
      break;
  }

  if (!extracted) {
    console.debug(
      "[mindtheapp] no JD detected",
      { atsType, host: location.hostname, url: location.href },
    );
    return null;
  }

  console.debug("[mindtheapp] JD detected", {
    atsType,
    jobTitle: extracted.jobTitle,
    company: extracted.company,
    jdLength: extracted.jdText.length,
  });

  return {
    atsType,
    pageUrl: location.href,
    jdText: extracted.jdText,
    jobTitle: extracted.jobTitle,
    company: extracted.company,
  };
}
