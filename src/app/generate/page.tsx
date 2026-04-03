"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { GapAnalysis } from "@/components/generate/gap-analysis";
import { ResumeReview } from "@/components/generate/resume-review";
import { JdQueue } from "@/components/generate/jd-queue";
import type { QueueItem, QueueItemStatus } from "@/components/generate/jd-queue";
import { showSnackbar } from "@/components/ui/snackbar";
import { Sparkles, Loader2, Link2, CheckCircle2, X, Plus } from "lucide-react";
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
export default function GeneratePage() {
  const { user, hasProfile, loading } = useAuth();
  const { setTopNav, clearTopNav } = useAppShell();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [jdText, setJdText] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [resume, setResume] = useState<ResumeResult | null>(null);
  const [returnApplicationId, setReturnApplicationId] = useState<string | null>(null);

  // LinkedIn import state
  const [showLinkedInInput, setShowLinkedInInput] = useState(false);
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<{ title: string; company: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const linkedInInputRef = useRef<HTMLInputElement>(null);

  // Batch queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  // Pre-fill from query params (from Jobs page or Apply page)
  useEffect(() => {
    const jd = searchParams.get("jd");
    const company = searchParams.get("company");
    const title = searchParams.get("title");
    const retAppId = searchParams.get("returnApplicationId");
    if (retAppId) setReturnApplicationId(retAppId);
    if (jd) {
      setJdText(jd);
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

  // Load existing application when coming from Applications page
  useEffect(() => {
    const applicationId = searchParams.get("application_id");
    if (!applicationId || !user) return;

    async function loadExistingApplication() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const [appRes, themesRes] = await Promise.all([
        supabase.from("applications").select("*").eq("id", applicationId).single(),
        supabase
          .from("application_themes")
          .select("*")
          .eq("application_id", applicationId)
          .order("theme_weight", { ascending: false }),
      ]);

      if (appRes.data && themesRes.data) {
        setAnalysis({
          application_id: applicationId!,
          company_name: appRes.data.company_name || "",
          job_title: appRes.data.job_title || "",
          fit_score: appRes.data.fit_score || 0,
          themes: themesRes.data,
        });
        setJdText(appRes.data.jd_text || "");
        setStep("analysis");
      }
    }

    loadExistingApplication();
  }, [searchParams, user]);

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

  async function handleLinkedInImport() {
    if (!linkedInUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/import-linkedin-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkedInUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJdText(data.description);
      setImportSuccess({ title: data.title || "Job", company: data.company || "" });
      setShowLinkedInInput(false);
      setLinkedInUrl("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setJdText("");
    setStep("input");
    setAnalysis(null);
    setResume(null);
    setImportSuccess(null);
    setImportError(null);
    setShowLinkedInInput(false);
    setLinkedInUrl("");
  }

  function handleAddToQueue() {
    if (!jdText.trim()) return;
    const firstLine = jdText.trim().split("\n").find((l) => l.trim()) || "Job Description";
    const label = firstLine.trim().slice(0, 80);
    setQueue((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        jdText: jdText.trim(),
        label,
        status: "pending",
      },
    ]);
    setJdText("");
    setImportSuccess(null);
  }

  function handleRemoveFromQueue(id: string) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function setQueueItemStatus(id: string, status: QueueItemStatus, error?: string) {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status, error } : item))
    );
  }

  async function processOneJd(item: QueueItem): Promise<boolean> {
    if (!user) return false;
    try {
      setQueueItemStatus(item.id, "analyzing");

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: item.jdText, user_id: user.id }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error);

      setQueueItemStatus(item.id, "generating");

      const genRes = await fetch("/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: analyzeData.application_id,
          user_id: user.id,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error);

      setQueueItemStatus(item.id, "done");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Batch processing failed for "${item.label}":`, err);
      setQueueItemStatus(item.id, "error", msg);
      return false;
    }
  }

  async function handleBatchProcess() {
    if (!user || batchRunning) return;

    const retryable = queue.filter((item) => item.status === "pending" || item.status === "error");
    if (!retryable.length) return;

    // Reset error items back to pending before reprocessing
    for (const item of retryable) {
      if (item.status === "error") setQueueItemStatus(item.id, "pending");
    }

    setBatchRunning(true);
    setBatchProgress(0);

    let succeeded = 0;
    let failed = 0;

    for (const item of retryable) {
      const ok = await processOneJd(item);
      if (ok) succeeded++;
      else failed++;
      setBatchProgress((prev) => prev + 1);
    }

    setBatchRunning(false);
    if (failed === 0) {
      showSnackbar(`${succeeded} resume${succeeded !== 1 ? "s" : ""} generated — check Applications`);
      setTimeout(() => router.push("/applications"), 1500);
    } else {
      showSnackbar(`${succeeded} generated, ${failed} failed`, "error");
    }
  }

  if (step === "review" && resume && analysis) {
    return (
      <ResumeReview
        resume={resume}
        analysis={analysis}
        onRegenerate={handleGenerate}
        onNewAnalysis={handleReset}
        onReturnToApplication={
          returnApplicationId
            ? () => router.push(`/apply?applicationId=${returnApplicationId}&resume_id=${resume.resume_id}`)
            : undefined
        }
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
        Paste a job description to get started
      </p>

      <div className="w-full">
        {/* Import success badge */}
        {importSuccess && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Imported: <strong>{importSuccess.title}</strong>
              {importSuccess.company ? ` at ${importSuccess.company}` : ""}
            </span>
            <button onClick={() => setImportSuccess(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <Textarea
          placeholder="Paste job description here..."
          value={jdText}
          onChange={(e) => {
            setJdText(e.target.value);
            if (importSuccess) setImportSuccess(null);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.max(120, Math.min(el.scrollHeight, 500)) + "px";
          }}
          rows={4}
          className="mb-2 resize-none border-[var(--border-input)] bg-[var(--bg-card)] text-base placeholder:text-[var(--text-faint)]"
          style={{ minHeight: "120px" }}
        />

        {/* LinkedIn import helper */}
        {!showLinkedInInput ? (
          <button
            type="button"
            onClick={() => {
              setShowLinkedInInput(true);
              setTimeout(() => linkedInInputRef.current?.focus(), 50);
            }}
            className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            Have a LinkedIn URL? Import it →
          </button>
        ) : (
          <div className="mb-4 space-y-2">
            <div className="flex gap-2">
              <Input
                ref={linkedInInputRef}
                type="url"
                placeholder="https://www.linkedin.com/jobs/view/..."
                value={linkedInUrl}
                onChange={(e) => { setLinkedInUrl(e.target.value); setImportError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleLinkedInImport()}
                className="flex-1 h-9 text-sm border-[var(--border-input)] bg-[var(--bg-card)]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleLinkedInImport}
                disabled={importing || !linkedInUrl.trim()}
                className="shrink-0"
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
              </Button>
              <button
                type="button"
                onClick={() => { setShowLinkedInInput(false); setLinkedInUrl(""); setImportError(null); }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {importError && (
              <p className="text-xs text-red-500">{importError}</p>
            )}
          </div>
        )}

        {queue.length === 0 ? (
          <div className="flex gap-2">
            <Button
              data-analyze-btn
              onClick={handleAnalyze}
              disabled={!jdText.trim() || analyzing}
              className="flex-1"
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
            <Button
              variant="outline"
              onClick={handleAddToQueue}
              disabled={!jdText.trim() || analyzing}
              size="lg"
              title="Add to queue for batch processing"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Queue
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleAddToQueue}
              disabled={!jdText.trim() || batchRunning}
              className="flex-1"
              size="lg"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add to Queue
            </Button>
            <Button
              onClick={handleBatchProcess}
              disabled={batchRunning || queue.filter((i) => i.status === "pending" || i.status === "error").length === 0}
              className="flex-1"
              size="lg"
            >
              {batchRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Process All (${queue.filter((i) => i.status === "pending" || i.status === "error").length})`
              )}
            </Button>
          </div>
        )}

        <JdQueue
          items={queue}
          batchRunning={batchRunning}
          batchProgress={batchProgress}
          onRemove={handleRemoveFromQueue}
        />
      </div>
    </div>
  );
}
