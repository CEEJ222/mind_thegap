import { clearToken, getToken } from "./auth";
import type {
  AnalyzeResponse,
  GenerateResumeResponse,
  ProfileResponse,
} from "./types";

const BASE_URL = "https://jobseek.fyi";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authedFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new ApiError("Not authenticated", 401);
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
    await clearToken();
    throw new ApiError("Session expired", 401);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }

  return (await res.json()) as T;
}

export interface AnalyzeJobInput {
  jdText: string;
  jobTitle: string;
  company: string;
}

export function analyzeJob(input: AnalyzeJobInput): Promise<AnalyzeResponse> {
  return authedFetch<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface GenerateResumeInput {
  applicationId: string;
  settings?: Record<string, unknown>;
}

export function generateResume(
  input: GenerateResumeInput,
): Promise<GenerateResumeResponse> {
  return authedFetch<GenerateResumeResponse>("/api/generate-resume", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProfile(): Promise<ProfileResponse> {
  return authedFetch<ProfileResponse>("/api/profile", { method: "GET" });
}

export function getApplicationDeepLink(applicationId: string): string {
  return `${BASE_URL}/applications/${applicationId}`;
}
