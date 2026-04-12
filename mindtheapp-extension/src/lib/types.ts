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

/** Messages exchanged with the background service worker. */
export type ExtensionMessage =
  | { type: "OPEN_AUTH" }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "AUTH_SUCCESS"; token: string }
  | { type: "JD_DETECTED"; payload: JobDescriptionPayload }
  | { type: "GET_CURRENT_JD" }
  | { type: "GET_AUTH_STATE" }
  | { type: "SIGN_OUT" };

export interface GetCurrentJdResponse {
  jd: JobDescriptionPayload | null;
}

export interface GetAuthStateResponse {
  authenticated: boolean;
}
