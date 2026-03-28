"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GapAnalysis } from "@/components/generate/gap-analysis";
import { ResumeReview } from "@/components/generate/resume-review";
import { Sparkles, Loader2, Link as LinkIcon, FileText } from "lucide-react";
import type { ScoreTier } from "@/lib/types/database";

interface ThemeResult {
  id: string;
  theme_name: string;
  theme_weight: number;
  score_tier: ScoreTier;
  score_numeric: number;
  explanation: string;
  evidence_chunk_ids: string[];
}

interface AnalysisResult {
  application_id: string;
  company_name: string;
  job_title: string;
  fit_score: number;
  themes: ThemeResult[];
}

interface ResumeResult {
  resume_id: string;
  file_path: string;
  editorial_notes: {
    shortened?: { role: string; reason: string }[];
    omitted?: { role: string; reason: string }[];
    prioritized?: string[];
  };
}

type Step = "input" | "analysis" | "review";
type InputMode = "paste" | "url";

export default function GeneratePage() {
  const { user, hasProfile, loading } = useAuth();
  const { setTopNav, clearTopNav } = useAppShell();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [jdText, setJdText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [step, setStep] = useState<Step>("input");
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [resume, setResume] = useState<ResumeResult | null>(null);

  // Pre-fill from query params (from Jobs page)
  useEffect(() => {
    const jd = searchParams.get("jd");
    const company = searchParams.get("company");
    const title = searchParams.get("title");
    if (jd) {
      setJdText(jd);
      setInputMode("paste");
      // Auto-analyze if we have all the data from the Jobs page
      if (company && title) {
        // Small delay to let the component mount
        setTimeout(() => {
          const analyzeBtn = document.querySelector("[data-analyze-btn]") as HTMLButtonElement;
          if (analyzeBtn) analyzeBtn.click();
        }, 100);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading && !hasProfile) {
      router.push("/profile");
    }
  }, [hasProfile, loading, router]);

  useEffect(() => {
    if (analysis) {
      setTopNav({
        companyName: analysis.company_name,
        jobTitle: analysis.job_title,
        fitScore: analysis.fit_score,
      });
    } else {
      clearTopNav();
    }
    return () => clearTopNav();
  }, [analysis, setTopNav, clearTopNav]);

  if (loading || !hasProfile) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  async function handleImportUrl() {
    if (!jobUrl.trim() || !user) return;
    setImporting(true);

    try {
      const res = await fetch("/api/import-job-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_url: jobUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const job = data.job;
      if (job?.description_text) {
        setJdText(job.description_text);
        setInputMode("paste");
      }
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setImporting(false);
    }
  }

  async function handleAnalyze() {
    if (!jdText.trim() || !user) return;
    setAnalyzing(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jdText, user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data);
      setStep("analysis");
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerate() {
    if (!analysis || !user) return;
    setGenerating(true);

    try {
      const res = await fetch("/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: analysis.application_id,
          user_id: user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResume(data);
      setStep("review");
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }

  function handleUpdateAnalysis(updated: AnalysisResult) {
    setAnalysis(updated);
  }

  function handleReset() {
    setJdText("");
    setJobUrl("");
    setStep("input");
    setAnalysis(null);
    setResume(null);
  }

  if (step === "review" && resume && analysis) {
    return (
      <ResumeReview
        resume={resume}
        analysis={analysis}
        onRegenerate={handleGenerate}
        onNewAnalysis={handleReset}
      />
    );
  }

  if (step === "analysis" && analysis) {
    return (
      <GapAnalysis
        analysis={analysis}
        onGenerate={handleGenerate}
        generating={generating}
        onBack={() => {
          setStep("input");
          setAnalysis(null);
        }}
        onUpdateAnalysis={handleUpdateAnalysis}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center justify-center px-4 py-6 md:px-9 md:py-16">
      <Sparkles className="mb-4 md:mb-6 h-10 w-10 md:h-12 md:w-12 text-[var(--accent)]" />
      <h1 className="mb-2 text-xl md:text-2xl font-bold text-[var(--text-primary)] text-center">
        Generate a Tailored Resume
      </h1>
      <p className="mb-4 md:mb-8 text-sm md:text-base text-[var(--text-muted)] text-center">
        Paste a job description or import from a LinkedIn URL
      </p>

      {/* Input Mode Tabs */}
      <div className="mb-4 flex w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-1">
        <button
          onClick={() => setInputMode("paste")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            inputMode === "paste"
              ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <FileText size={16} />
          Paste JD
        </button>
        <button
          onClick={() => setInputMode("url")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            inputMode === "url"
              ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <LinkIcon size={16} />
          Import from URL
        </button>
      </div>

      <div className="w-full">
        {inputMode === "paste" ? (
          <>
            <Textarea
              placeholder="Paste job description here..."
              value={jdText}
              onChange={(e) => {
                setJdText(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.max(120, Math.min(el.scrollHeight, 500)) + "px";
              }}
              rows={4}
              className="mb-4 resize-none border-[var(--border-input)] bg-[var(--bg-card)] text-base placeholder:text-[var(--text-faint)]"
              style={{ minHeight: "120px" }}
            />
            <Button
              data-analyze-btn
              onClick={handleAnalyze}
              disabled={!jdText.trim() || analyzing}
              className="w-full"
              size="lg"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Analyze"
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="mb-3">
              <Input
                placeholder="https://www.linkedin.com/jobs/view/3692563200"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                className="border-[var(--border-input)] bg-[var(--bg-card)] text-base"
              />
              <p className="mt-1.5 text-xs text-[var(--text-faint)]">
                Paste a LinkedIn job URL — we&apos;ll import the job description automatically
              </p>
            </div>

            <Button
              onClick={handleImportUrl}
              disabled={!jobUrl.trim() || importing}
              className="w-full"
              size="lg"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing job...
                </>
              ) : (
                "Import & Analyze"
              )}
            </Button>

            {/* If JD was imported, show it and the analyze button */}
            {jdText && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">
                  Imported job description:
                </p>
                <Textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  rows={6}
                  className="mb-3 resize-none border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                  style={{ minHeight: "120px" }}
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={!jdText.trim() || analyzing}
                  className="w-full"
                  size="lg"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
