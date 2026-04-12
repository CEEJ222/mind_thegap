import type { AtsType, JobDescriptionPayload } from "./types";

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

function extractGreenhouse(): ExtractedJob | null {
  // boards.greenhouse.io — #content .job-post holds the body
  const container =
    document.querySelector("#content .job-post") ??
    document.querySelector("#content");
  if (!container) return null;

  const jdText = normalizeText(container.textContent ?? "");
  if (jdText.length < 50) return null;

  const jobTitle =
    textFrom(".app-title") ||
    textFrom("h1.app-title") ||
    textFrom("h1") ||
    document.title;

  const company =
    textFrom(".company-name") ||
    textFrom("span.company-name") ||
    // Fallback: board company name often appears after "at "
    (document.title.split(" at ")[1] ?? "").trim() ||
    "";

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
    decodeURIComponent(location.pathname.split("/").filter(Boolean)[0] ?? "");

  return { jdText, jobTitle, company };
}

function extractAshby(): ExtractedJob | null {
  // TODO: Harden Ashby selectors. Ashby renders into a React shell with
  // dynamic class names; we grab the largest text block in the job detail
  // container as a placeholder.
  const container =
    document.querySelector("[class*='_jobPostingBody']") ??
    document.querySelector("[class*='jobDescription']") ??
    document.querySelector("main");
  if (!container) return null;

  const jdText = normalizeText(container.textContent ?? "");
  if (jdText.length < 50) return null;

  return {
    jdText,
    jobTitle: textFrom("h1") || document.title,
    company: textFrom("[class*='_companyName']") || "",
  };
}

function extractLinkedIn(): ExtractedJob | null {
  // TODO: LinkedIn DOM changes frequently; this is a best-effort placeholder.
  const card = document.querySelector(".job-details-jobs-unified-top-card");
  const description =
    document.querySelector(".jobs-description__content") ??
    document.querySelector("#job-details");
  if (!card && !description) return null;

  const jdText = normalizeText(
    [card?.textContent ?? "", description?.textContent ?? ""].join("\n"),
  );
  if (jdText.length < 50) return null;

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
  // Largest <article>/<main>/<section> text block on the page.
  const candidates = Array.from(
    document.querySelectorAll("article, main, section, div"),
  );
  let best: { el: Element; length: number } | null = null;
  for (const el of candidates) {
    const len = (el.textContent ?? "").length;
    if (len > 300 && (!best || len > best.length)) {
      best = { el, length: len };
    }
  }
  if (!best) return null;
  const jdText = normalizeText(best.el.textContent ?? "");
  if (jdText.length < 200) return null;

  return {
    jdText,
    jobTitle: textFrom("h1") || document.title,
    company: "",
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

  if (!extracted) return null;

  return {
    atsType,
    pageUrl: location.href,
    jdText: extracted.jdText,
    jobTitle: extracted.jobTitle,
    company: extracted.company,
  };
}
