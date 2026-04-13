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

/** Strip trailing " logo" / " icon" from company names read from img[alt]
 *  so the badge doesn't end up saying "Machina Labs logo · Click to analyze". */
function cleanCompanyName(name: string): string {
  return name
    .replace(/\s*(logo|icon|mark|wordmark)\s*$/i, "")
    .replace(/^\s*logo\s*/i, "")
    .trim();
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
  if (h.includes("rippling.com")) return "rippling";
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
      "main, article, section, [role='main'], [role='tabpanel'], div[class*='content'], div[class*='description'], div[class*='body']",
    ),
  );
  // Also scan all divs as a last resort — but cap to avoid O(n²) on giant DOMs.
  if (candidates.length === 0) {
    const divs = Array.from(root.querySelectorAll("div")).slice(0, 500);
    candidates.push(...divs);
  }

  const bodyLen = document.body?.textContent?.length ?? Infinity;
  let best: { el: Element; length: number } | null = null;
  for (const el of candidates) {
    // Skip invisible/off-screen panels — tabpanels for the inactive tab
    // (e.g. Ashby's "Application" panel while user is on "Overview")
    // would otherwise swallow the pick.
    if (!isElementVisible(el)) continue;
    const text = (el.textContent ?? "").trim();
    const len = text.length;
    if (len < 400) continue;
    // Reject elements that contain ~the entire document — those are the
    // <body> or top-level wrappers, not the JD body.
    if (len > bodyLen * 0.95) continue;
    if (!best || len > best.length) best = { el, length: len };
  }
  return best?.el ?? null;
}

function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  // Fast path: offsetParent is null for display:none / visibility:hidden
  // / elements detached from the render tree. Not reliable for fixed-pos
  // elements but good enough for our use case.
  if (el.offsetParent === null) {
    const style = window.getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;
    // Fixed-position elements still report null offsetParent but can be
    // visible — check for any rendered box.
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
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
  const company = cleanCompanyName(
    textFrom("header h2") ||
      textFrom("[class*='company']") ||
      companyFromPath,
  );

  return { jdText, jobTitle, company };
}

function extractLever(): ExtractedJob | null {
  // The headline card holds the title + location + team metadata. That's
  // what the previous implementation was capturing — ~60 chars of useless
  // "Senior Product Manager Chatsworth, CA Product / Full-time / On-site".
  const headline = document.querySelector(".posting-headline");

  // The actual JD body lives in `.section-page-centered` / `.content` /
  // the collection of `.section` blocks that follow the headline on a
  // modern Lever posting. Collect all of them and concatenate their text.
  const bodyEls = Array.from(
    document.querySelectorAll(
      ".posting .section, .posting-page .section, .content .section, .content-wrapper .section",
    ),
  );
  let body = bodyEls.map((el) => el.textContent ?? "").join("\n");

  // Fallback: pickLargestTextBlock if the `.section` selectors missed
  // (Lever has a few layout variants).
  if (body.trim().length < 200) {
    const largest = pickLargestTextBlock();
    body = largest?.textContent ?? "";
  }

  const jdText = normalizeText(
    [headline?.textContent ?? "", body].join("\n"),
  );
  if (jdText.length < 200) return null;

  const jobTitle = textFrom(".posting-headline h2") || textFrom("h2") || "";

  // Alt text often ships as "Acme Inc. logo" — strip the suffix.
  const logoAlt =
    document.querySelector<HTMLImageElement>(".main-header-logo img")?.alt ??
    "";
  const company =
    cleanCompanyName(logoAlt) ||
    // Lever pages are at jobs.lever.co/{company}/...
    prettifySlug(location.pathname.split("/").filter(Boolean)[0] ?? "");

  return { jdText, jobTitle, company };
}

function extractAshby(): ExtractedJob | null {
  // Modern Ashby uses dynamic CSS-in-JS class names and an Overview /
  // Application tab pattern. The "Application" tabpanel is often present
  // in the DOM alongside "Overview" — picking it up by role='tabpanel'
  // or <main> gives us the wrong (empty or very short) panel.
  //
  // Strategy: try a couple of known class-name patterns that have held up
  // historically, then fall straight to pickLargestTextBlock (which
  // compares text lengths and naturally selects the visible Overview
  // tabpanel over an empty sibling).
  const container =
    document.querySelector("[class*='_jobPostingBody']") ??
    document.querySelector("[class*='jobDescription']") ??
    document.querySelector("[class*='_descriptionContainer']") ??
    pickLargestTextBlock();
  if (!container) return null;

  const jdText = normalizeText(container.textContent ?? "");
  if (jdText.length < 200) return null;

  // Title: prefer h1; fall back to page title minus the company suffix.
  let jobTitle = textFrom("h1");
  if (!jobTitle) {
    const t = (document.title ?? "").trim();
    jobTitle =
      t.split(/\s+[-—|@]\s+/)[0] ?? t.split(" at ")[0] ?? t;
  }

  const pathSlug = location.pathname.split("/").filter(Boolean)[0] ?? "";
  const company = cleanCompanyName(
    textFrom("[class*='_companyName']") ||
      textFrom("[data-testid*='company']") ||
      textFrom("header h2") ||
      prettifySlug(pathSlug),
  );

  return { jdText, jobTitle, company };
}

function extractRippling(): ExtractedJob | null {
  // URL shape: ats.rippling.com/{company-slug}/jobs/{uuid}
  // Rippling ATS is a React SPA. We don't have a stable selector catalogue
  // yet — start with patterns that have worked on similar shells and fall
  // through to pickLargestTextBlock (which filters invisible panels).
  const container =
    document.querySelector("[class*='jobDescription']") ??
    document.querySelector("[class*='JobDescription']") ??
    document.querySelector("[class*='job-description']") ??
    document.querySelector("[class*='_description']") ??
    document.querySelector("[data-testid*='description']") ??
    document.querySelector("[data-testid*='job']") ??
    pickLargestTextBlock();
  if (!container) return null;

  const jdText = normalizeText(container.textContent ?? "");
  if (jdText.length < 200) return null;

  let jobTitle = textFrom("h1");
  if (!jobTitle) {
    const t = (document.title ?? "").trim();
    jobTitle = t.split(/\s+[-—|@]\s+/)[0] ?? t.split(" at ")[0] ?? t;
  }

  // Company slug is the first path segment: /plenful/jobs/...
  const pathSlug = location.pathname.split("/").filter(Boolean)[0] ?? "";
  const company = cleanCompanyName(
    textFrom("header [class*='company']") ||
      textFrom("[class*='companyName']") ||
      textFrom("[data-testid*='company']") ||
      prettifySlug(pathSlug),
  );

  return { jdText, jobTitle, company };
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

  // Only look at the actively-rendered text so hidden/stale confirmation
  // blocks from earlier in a SPA flow don't false-positive.
  const bodyText = (document.body?.innerText ?? "").toLowerCase();
  const textLookedLikeConfirmation =
    // "Thanks for applying" / "Thank you for applying" / "Thank you for your application"
    /thank\s*(you|s)?\s+for\s+(your\s+)?(application|applying)/.test(bodyText) ||
    // "We've received your application" / "We have received your application"
    /we[ '’]?ve\s+received\s+your\s+application/.test(bodyText) ||
    /we\s+have\s+received\s+your\s+application/.test(bodyText) ||
    // "Your application was successfully submitted" / "Your application has been submitted"
    /your\s+application\s+(has\s+been\s+|was\s+(successfully\s+)?)?(received|submitted|sent)/.test(
      bodyText,
    ) ||
    // "Application submitted" / "Application has been submitted" / "Application successfully sent"
    /application\s+(has\s+been\s+|was\s+|successfully\s+)?(received|submitted|sent)/.test(
      bodyText,
    ) ||
    // "Successfully submitted" / "Successfully applied" — common success-banner phrasing
    /successfully\s+(submitted|applied|sent)/.test(bodyText) ||
    // Ashby modal: "Congrats on applying!" / "Congratulations on applying"
    /congrat(s|ulations)[\s!,]*on\s+applying/.test(bodyText) ||
    // Greenhouse: "Thanks for your application to …"
    /thanks\s+for\s+your\s+application/.test(bodyText);

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
  const company = cleanCompanyName(
    textFrom("header h2") ||
      textFrom("[class*='company']") ||
      prettifySlug(pathParts[0] ?? ""),
  );

  console.debug("[mindtheapp] applied confirmation detected", {
    atsType,
    jobUrl,
    title,
    company,
    viaUrl: urlLookedLikeConfirmation,
    viaText: textLookedLikeConfirmation,
  });

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
    case "rippling":
      extracted = extractRippling();
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
