export type AtsType = "greenhouse" | "lever" | "ashby" | "linkedin" | "generic";

export interface JobDescriptionPayload {
  jdText: string;
  jobTitle: string;
  company: string;
  atsType: AtsType;
  pageUrl: string;
}

/** Theme tiers from the analyze prompt. */
export type ScoreTier = "strong" | "weak" | "none";

/** Row shape returned by POST /api/analyze for each theme. */
export interface AnalysisTheme {
  id: string;
  application_id: string;
  theme_name: string;
  theme_weight: number;
  score_tier: ScoreTier;
  score_numeric: number;
  explanation: string;
  evidence_chunk_ids: string[];
}

/** Response body of POST /api/analyze. */
export interface AnalyzeResponse {
  application_id: string;
  company_name: string;
  job_title: string;
  fit_score: number;
  themes: AnalysisTheme[];
}

/** Response body of POST /api/generate-resume.
 *  The resume markdown lives at `editorial_notes.resume_content`. */
export interface GenerateResumeResponse {
  resume_id: string;
  file_path: string;
  editorial_notes: {
    resume_content?: string;
    shortened?: Array<{ role: string; reason: string }>;
    omitted?: Array<{ role: string; reason: string }>;
    prioritized?: string[];
  };
}

/** Response body of GET /api/profile. */
export interface ProfileResponse {
  user_id: string;
  email: string | null;
  has_profile: boolean;
  profile_chunk_count: number;
}

/** Response body of POST /api/jobs/save. */
export interface SaveJobResponse {
  job_id: string;
  status: "saved";
  /** True if this was the first save; false for re-saves. */
  created: boolean;
}

/** Response body of POST /api/jobs/mark-applied. */
export interface MarkAppliedResponse {
  job_id: string;
  status: "applied";
  previous_status: string | null;
}

/** Minimal payload for applied-detection — the full JD isn't always available
 *  on a confirmation page, so we ship just what the extractor could find. */
export interface AppliedDetectionPayload {
  pageUrl: string;
  jobUrl: string;
  title?: string;
  company?: string;
  atsType?: AtsType;
}

/** Subset of user_settings the extension will spray onto apply-form
 *  fields. Mirrors GET /api/apply/profile. */
export interface AutofillProfile {
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  location: string | null;
  work_authorization: string | null;
  requires_sponsorship: boolean | null;
  open_to_relocation: boolean | null;
}

/** Result of a content-script autofill pass, returned to the side panel. */
export interface AutofillResult {
  filled: number;
  skipped: number;
  fields: Array<{ key: string; label: string; filled: boolean }>;
}

/** Sent by the content script when an apply-form is detected on the page.
 *  Cached per-tab by the background so the side panel can decide whether
 *  to surface the Autofill button. */
export interface ApplyFormSignal {
  pageUrl: string;
  atsType: AtsType;
  /** Rough candidate count — if it's 0 the side panel should NOT offer autofill. */
  candidateCount: number;
}

/** Messages exchanged with the background service worker. */
export type ExtensionMessage =
  | { type: "OPEN_AUTH" }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "AUTH_SUCCESS"; token: string }
  | { type: "JD_DETECTED"; payload: JobDescriptionPayload }
  | { type: "APPLIED_DETECTED"; payload: AppliedDetectionPayload }
  | { type: "APPLY_FORM_DETECTED"; payload: ApplyFormSignal }
  | { type: "APPLY_FORM_CLEARED" }
  | { type: "GET_CURRENT_JD" }
  | { type: "GET_CURRENT_FORM" }
  | { type: "GET_AUTH_STATE" }
  | { type: "SIGN_OUT" };

/** Messages routed to the content script via chrome.tabs.sendMessage. */
export type ContentScriptMessage = {
  type: "AUTOFILL";
  profile: AutofillProfile;
};

export interface GetCurrentJdResponse {
  jd: JobDescriptionPayload | null;
}

export interface GetAuthStateResponse {
  authenticated: boolean;
}

export interface GetCurrentFormResponse {
  form: ApplyFormSignal | null;
}
