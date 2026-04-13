import { clearToken, getToken } from "./auth";
import type {
  AnalyzeResponse,
  GenerateResumeResponse,
  MarkAppliedResponse,
  ProfileResponse,
  SaveJobResponse,
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

export interface SaveJobInput {
  url: string;
  title?: string;
  company?: string;
  description?: string;
  location?: string;
  atsType?: string;
}

export function saveJob(input: SaveJobInput): Promise<SaveJobResponse> {
  return authedFetch<SaveJobResponse>("/api/jobs/save", {
    method: "POST",
    body: JSON.stringify({
      url: input.url,
      title: input.title,
      company: input.company,
      description: input.description,
      location: input.location,
      ats_type: input.atsType,
    }),
  });
}

export interface MarkAppliedInput {
  url: string;
  title?: string;
  company?: string;
  atsType?: string;
}

export function markApplied(
  input: MarkAppliedInput,
): Promise<MarkAppliedResponse> {
  return authedFetch<MarkAppliedResponse>("/api/jobs/mark-applied", {
    method: "POST",
    body: JSON.stringify({
      url: input.url,
      title: input.title,
      company: input.company,
      ats_type: input.atsType,
    }),
  });
}

export interface ExportResumeInput {
  filePath: string;
  fileName?: string;
  format?: "docx" | "md";
}

/**
 * Fetch a generated resume from /api/export-resume as a Blob so the side
 * panel can offer it for direct download or drag-and-drop onto ATS file
 * upload fields. Server returns a real DOCX (or markdown) with the
 * appropriate Content-Type header.
 */
export async function exportResumeDocx(
  input: ExportResumeInput,
): Promise<{ blob: Blob; filename: string }> {
  const token = await getToken();
  if (!token) {
    throw new ApiError("Not authenticated", 401, "NO_TOKEN");
  }

  const format = input.format ?? "docx";
  const fileName = input.fileName ?? "resume";
  const res = await fetch(`${BASE_URL}/api/export-resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      file_path: input.filePath,
      format,
      file_name: fileName,
    }),
  });

  if (res.status === 401) {
    await clearToken();
    throw new ApiError("Session expired", 401, "UNAUTHENTICATED");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(detail, res.status);
  }

  const blob = await res.blob();
  return {
    blob,
    filename: `${fileName}.${format}`,
  };
}

/** Deep link to the applications page with a specific one pre-selected. */
export function getApplicationDeepLink(applicationId: string): string {
  return `${BASE_URL}/applications?id=${encodeURIComponent(applicationId)}`;
}

/** Deep link to the profile editor — used by the "Add your profile first" gate. */
export function getProfileDeepLink(): string {
  return `${BASE_URL}/profile`;
}

/** Deep link to the saved-jobs list. */
export function getSavedJobsDeepLink(): string {
  return `${BASE_URL}/jobs/saved`;
}
