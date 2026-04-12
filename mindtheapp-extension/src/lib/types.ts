export type AtsType = "greenhouse" | "lever" | "ashby" | "linkedin" | "generic";

export interface JobDescriptionPayload {
  jdText: string;
  jobTitle: string;
  company: string;
  atsType: AtsType;
  pageUrl: string;
}

export type ThemeTier = "strong" | "weak" | "none";

export interface ThemeResult {
  id: string;
  label: string;
  tier: ThemeTier;
  score_numeric: number;
  evidence?: string;
}

export interface AnalyzeResponse {
  applicationId: string;
  overallFit: number;
  themes: ThemeResult[];
}

export interface GenerateResumeResponse {
  resumeText: string;
  applicationId: string;
}

export interface ProfileResponse {
  id: string;
  email: string;
  name?: string;
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
