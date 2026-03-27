"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GapAnalysis } from "@/components/generate/gap-analysis";
import { ResumeReview } from "@/components/generate/resume-review";
import { Sparkles, Loader2 } from "lucide-react";
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
  const { user, hasProfile } = useAuth();
  const router = useRouter();
  const [jdText, setJdText] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [resume, setResume] = useState<ResumeResult | null>(null);

  if (!hasProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="mb-4 text-muted-foreground">
          Add at least one entry to your profile to start generating resumes.
        </p>
        <Button onClick={() => router.push("/profile")}>Go to Profile</Button>
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

  function handleReset() {
    setJdText("");
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
        onBack={() => setStep("input")}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-16">
      <Sparkles className="mb-6 h-12 w-12 text-accent" />
      <h1 className="mb-2 text-2xl font-bold">Generate a Tailored Resume</h1>
      <p className="mb-8 text-muted-foreground">
        Paste a job description and we&apos;ll analyze it against your profile
      </p>
      <div className="w-full">
        <Textarea
          placeholder="Paste job description here..."
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          rows={12}
          className="mb-4 resize-none text-base"
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
    </div>
  );
}
