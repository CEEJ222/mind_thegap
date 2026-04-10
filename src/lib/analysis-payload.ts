/**
 * Normalize LLM gap-analysis JSON before DB writes (enums, ranges, non-null strings).
 */

export type ScoreTier = "strong" | "weak" | "none";

export function normalizeScoreTier(raw: unknown): ScoreTier {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (s === "strong" || s === "weak" || s === "none") return s;
  return "none";
}

export function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : Number.parseFloat(String(n));
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
}

export function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number.parseInt(String(n), 10);
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, Math.round(x)));
}

export function normalizeAnalysisPayload(raw: unknown): {
  company_name: string;
  job_title: string;
  fit_score: number;
  themes: Array<{
    theme_name: string;
    theme_weight: number;
    score_tier: ScoreTier;
    score_numeric: number;
    explanation: string;
  }>;
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Analysis response must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const company_name = String(o.company_name ?? "").trim() || "Unknown";
  const job_title = String(o.job_title ?? "").trim() || "Unknown";
  const rawFit = o.fit_score;
  const fitNum =
    typeof rawFit === "number" ? rawFit : Number.parseFloat(String(rawFit));
  const fit_score = Number.isFinite(fitNum)
    ? Math.min(100, Math.max(0, fitNum))
    : 0;
  const themesRaw = Array.isArray(o.themes) ? o.themes : [];
  const themes = themesRaw.map((t, i) => {
    const tr = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    return {
      theme_name:
        String(tr.theme_name ?? `Theme ${i + 1}`).trim() || `Theme ${i + 1}`,
      theme_weight: clamp01(tr.theme_weight),
      score_tier: normalizeScoreTier(tr.score_tier),
      score_numeric: clampScore(tr.score_numeric),
      explanation: String(tr.explanation ?? "").trim(),
    };
  });
  return { company_name, job_title, fit_score, themes };
}
