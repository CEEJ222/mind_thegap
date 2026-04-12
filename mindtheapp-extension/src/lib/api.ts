import { clearToken, getToken } from "./auth";
import type {
  AnalyzeResponse,
  GenerateResumeResponse,
  ProfileResponse,
} from "./types";

const BASE_URL = "https://www.jobseek.fyi";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function authedFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new ApiError("Not authenticated", 401, "NO_TOKEN");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Token is invalid or expired — purge it so the side panel drops to
    // the unauthenticated state on the next hydrate.
    await clearToken();
    throw new ApiError("Session expired", 401, "UNAUTHENTICATED");
  }

  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
      if (body?.code) code = body.code;
    } catch {
      /* body not JSON */
    }
    throw new ApiError(detail, res.status, code);
  }

  return (await res.json()) as T;
}

export interface AnalyzeJobInput {
  jdText: string;
}

export function analyzeJob(input: AnalyzeJobInput): Promise<AnalyzeResponse> {
  return authedFetch<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ jd_text: input.jdText }),
  });
}

export interface GenerateResumeInput {
  applicationId: string;
}

export function generateResume(
  input: GenerateResumeInput,
): Promise<GenerateResumeResponse> {
  return authedFetch<GenerateResumeResponse>("/api/generate-resume", {
    method: "POST",
    body: JSON.stringify({ application_id: input.applicationId }),
  });
}

export function getProfile(): Promise<ProfileResponse> {
  return authedFetch<ProfileResponse>("/api/profile", { method: "GET" });
}

/** Deep link to an application detail page on jobseek.fyi. */
export function getApplicationDeepLink(applicationId: string): string {
  return `${BASE_URL}/applications/${applicationId}`;
}

/** Deep link to the profile editor — used by the "Add your profile first" gate. */
export function getProfileDeepLink(): string {
  return `${BASE_URL}/profile`;
}
