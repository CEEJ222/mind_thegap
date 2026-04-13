import type { AutofillProfile, AutofillResult } from "./types";

/**
 * Autofill engine — finds contact / link / location fields on an ATS
 * application form and populates them with the user's saved profile
 * values using React-safe value setters (React tracks the "native" value
 * separately from the DOM value, so a plain `input.value = "..."`
 * assignment is ignored by controlled inputs).
 *
 * Intentionally narrow: we fill boring, high-confidence text inputs.
 * Dropdowns for work auth / sponsorship need site-specific value maps
 * so they'll land in a later slice; same for EEO fields and free-text
 * cover-letter questions.
 */

type ProfileKey =
  | "full_name"
  | "preferred_name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "linkedin_url"
  | "github_url"
  | "website_url"
  | "location";

interface FieldRule {
  key: ProfileKey;
  label: string;
  /** Patterns tested against a normalized combo of name/id/label text. */
  patterns: RegExp[];
  /** input `type` attributes this rule is willing to fill. */
  types: Set<string>;
  /** Skip if any of these patterns match (e.g. "manager email" ≠ user's email). */
  negatives?: RegExp[];
}

const TEXT_TYPES = new Set(["text", "email", "tel", "url", "search", ""]);

/**
 * Order matters — earlier rules win ties. preferred_name before first_name
 * so that fields literally labeled "Preferred Name" don't get swallowed by
 * the more general first-name rule.
 */
const RULES: FieldRule[] = [
  {
    key: "preferred_name",
    label: "Preferred name",
    patterns: [/\bpreferred\s*(first\s*)?name\b/, /\bgoes\s*by\b/, /\bnickname\b/],
    types: TEXT_TYPES,
  },
  {
    key: "first_name",
    label: "First name",
    patterns: [/\bfirst\s*name\b/, /\bgiven\s*name\b/, /\bfname\b/],
    types: TEXT_TYPES,
    negatives: [/preferred/],
  },
  {
    key: "last_name",
    label: "Last name",
    patterns: [/\blast\s*name\b/, /\bsurname\b/, /\bfamily\s*name\b/, /\blname\b/],
    types: TEXT_TYPES,
  },
  {
    key: "full_name",
    label: "Full name",
    patterns: [/\bfull\s*name\b/, /\blegal\s*name\b/, /\byour\s*name\b/, /^\s*name\s*$/],
    types: TEXT_TYPES,
    negatives: [/company|hiring|manager|reference|emergency/],
  },
  {
    key: "email",
    label: "Email",
    patterns: [/\bemail\s*address\b/, /\be[- ]?mail\b/, /\bemail\b/],
    types: new Set(["email", "text", ""]),
    negatives: [/company|hiring|manager|reference|emergency|alternate|secondary/],
  },
  {
    key: "phone",
    label: "Phone",
    patterns: [/\bphone\s*number\b/, /\bphone\b/, /\bmobile\b/, /\bcell\b/, /\btelephone\b/],
    types: new Set(["tel", "text", ""]),
    negatives: [/company|hiring|manager|reference|emergency/],
  },
  {
    key: "linkedin_url",
    label: "LinkedIn URL",
    patterns: [/\blinkedin\b/],
    types: new Set(["url", "text", ""]),
  },
  {
    key: "github_url",
    label: "GitHub URL",
    patterns: [/\bgithub\b/, /\bgit\s*hub\b/],
    types: new Set(["url", "text", ""]),
  },
  {
    key: "website_url",
    label: "Website / portfolio",
    patterns: [
      /\bportfolio\b/,
      /\bpersonal\s*website\b/,
      /\bpersonal\s*site\b/,
      /\bwebsite\b/,
      /\bweb\s*site\b/,
      /\bpersonal\s*url\b/,
    ],
    types: new Set(["url", "text", ""]),
    negatives: [/linkedin|github|company/],
  },
  {
    key: "location",
    label: "Location",
    patterns: [
      /\bcurrent\s*location\b/,
      /\bwhere\s*are\s*you\s*(currently\s*)?located\b/,
      /\bcity\s*,?\s*(state|country)\b/,
      /\bcity\b/,
      /\blocation\b/,
    ],
    types: TEXT_TYPES,
    negatives: [/company|hiring|manager|emergency/],
  },
];

/** Normalize a raw label string for matching. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\u00A0]+/g, " ").trim();
}

/** Pull every string we can find that describes this input to a human. */
function labelTextFor(input: HTMLElement): string {
  const parts: string[] = [];
  const name = input.getAttribute("name");
  const id = input.getAttribute("id");
  const placeholder = input.getAttribute("placeholder");
  const aria = input.getAttribute("aria-label");
  const ariaLabelledBy = input.getAttribute("aria-labelledby");
  const dataQa = input.getAttribute("data-qa");
  const dataTestId = input.getAttribute("data-testid");

  if (name) parts.push(name.replace(/[_\-.]+/g, " "));
  if (id) parts.push(id.replace(/[_\-.]+/g, " "));
  if (placeholder) parts.push(placeholder);
  if (aria) parts.push(aria);
  if (dataQa) parts.push(dataQa.replace(/[_\-.]+/g, " "));
  if (dataTestId) parts.push(dataTestId.replace(/[_\-.]+/g, " "));

  // Explicit <label for="id">
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`);
    if (label?.textContent) parts.push(label.textContent);
  }

  // Wrapping <label>
  let ancestor: HTMLElement | null = input.parentElement;
  for (let hops = 0; ancestor && hops < 4; hops++, ancestor = ancestor.parentElement) {
    if (ancestor.tagName === "LABEL" && ancestor.textContent) {
      parts.push(ancestor.textContent);
      break;
    }
  }

  // aria-labelledby — pull text from each referenced id
  if (ariaLabelledBy) {
    for (const refId of ariaLabelledBy.split(/\s+/)) {
      const el = document.getElementById(refId);
      if (el?.textContent) parts.push(el.textContent);
    }
  }

  return normalize(parts.join(" | "));
}

function cssEscape(s: string): string {
  // Minimal CSS.escape polyfill so the label selector works even for ids
  // that contain characters like ':' or '/'.
  return s.replace(/([^\w-])/g, "\\$1");
}

/**
 * React-safe value assignment. React tracks "lastValue" per input on the
 * native element; if we set `input.value = "x"` directly, the React
 * onChange callback compares to lastValue, sees no delta, and reverts.
 * The trick is to call the prototype's value setter first.
 */
function setReactValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Returns the profile value for a resolved rule key, or null if unknown/empty. */
function profileValue(
  profile: AutofillProfile,
  key: ProfileKey,
): string | null {
  const v = (() => {
    switch (key) {
      case "full_name":
        return profile.full_name;
      case "preferred_name":
        return profile.preferred_name || splitName(profile.full_name).first;
      case "first_name":
        return profile.preferred_name || splitName(profile.full_name).first;
      case "last_name":
        return splitName(profile.full_name).last;
      case "email":
        return profile.email;
      case "phone":
        return profile.phone;
      case "linkedin_url":
        return profile.linkedin_url;
      case "github_url":
        return profile.github_url;
      case "website_url":
        return profile.website_url;
      case "location":
        return profile.location;
      default:
        return null;
    }
  })();
  return v && v.trim().length > 0 ? v.trim() : null;
}

function splitName(full: string | null): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Return all visible, fillable inputs on the page. */
function candidateInputs(): Array<HTMLInputElement | HTMLTextAreaElement> {
  const nodes = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ),
  );
  return nodes.filter((n) => {
    if (n.disabled || n.readOnly) return false;
    const type = (n.getAttribute("type") ?? "text").toLowerCase();
    if (n instanceof HTMLInputElement) {
      if (["file", "hidden", "checkbox", "radio", "submit", "button"].includes(type)) {
        return false;
      }
    }
    // Hidden via CSS
    const rect = n.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  });
}

function matchRule(input: HTMLInputElement | HTMLTextAreaElement): FieldRule | null {
  const type = (input.getAttribute("type") ?? "text").toLowerCase();
  const label = labelTextFor(input);
  if (!label) return null;

  for (const rule of RULES) {
    if (!rule.types.has(type)) continue;
    if (rule.negatives?.some((p) => p.test(label))) continue;
    if (rule.patterns.some((p) => p.test(label))) return rule;
  }
  return null;
}

export function runAutofill(profile: AutofillProfile): AutofillResult {
  const inputs = candidateInputs();
  const used = new Set<HTMLElement>();
  const fields: AutofillResult["fields"] = [];
  let filled = 0;
  let skipped = 0;

  for (const input of inputs) {
    if (used.has(input)) continue;
    const rule = matchRule(input);
    if (!rule) continue;

    // Don't stomp user-entered values.
    if (input.value && input.value.trim().length > 0) {
      fields.push({ key: rule.key, label: rule.label, filled: false });
      skipped += 1;
      used.add(input);
      continue;
    }

    const value = profileValue(profile, rule.key);
    if (!value) {
      fields.push({ key: rule.key, label: rule.label, filled: false });
      skipped += 1;
      used.add(input);
      continue;
    }

    try {
      setReactValue(input, value);
      used.add(input);
      filled += 1;
      fields.push({ key: rule.key, label: rule.label, filled: true });
    } catch (err) {
      console.warn("[mindtheapp] autofill write failed", rule.key, err);
      skipped += 1;
      fields.push({ key: rule.key, label: rule.label, filled: false });
    }
  }

  return { filled, skipped, fields };
}

/**
 * Heuristic: does this page look like an apply form? Used by the content
 * script to send a lightweight FORM_DETECTED signal to the background so
 * the side panel can decide whether to surface the Autofill button.
 *
 * Returns a count of UNIQUE field keys we matched (not raw input count)
 * so a form with first/last/email/phone all named the same way as a
 * single key doesn't inflate the count. Plus a URL-based hint (`/apply`,
 * `/application`) that lowers the threshold needed to surface the card.
 */
export function detectApplyForm(): { candidateCount: number } {
  const inputs = candidateInputs();
  const matchedKeys = new Set<ProfileKey>();
  for (const input of inputs) {
    const rule = matchRule(input);
    if (rule) matchedKeys.add(rule.key);
  }
  const urlHintsApply = /\/(apply|application)(\/|$|\?)/i.test(
    window.location.pathname,
  );
  // Without the URL hint, require ≥2 distinct fields. With it (we're
  // clearly on an apply route), even a single matched field is enough
  // to offer Autofill.
  const candidateCount = matchedKeys.size;
  if (urlHintsApply && candidateCount >= 1) {
    return { candidateCount };
  }
  if (candidateCount >= 2) {
    return { candidateCount };
  }
  return { candidateCount: 0 };
}
