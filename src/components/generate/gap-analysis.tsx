"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn, getScoreTierIcon } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowLeft,
  FileText,
} from "lucide-react";
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

interface Props {
  analysis: AnalysisResult;
  onGenerate: () => void;
  generating: boolean;
  onBack: () => void;
}

export function GapAnalysis({ analysis, onGenerate, generating, onBack }: Props) {
  const { user } = useAuth();
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [themes, setThemes] = useState(analysis.themes);
  const [gapFillText, setGapFillText] = useState("");
  const [gapFillCompany, setGapFillCompany] = useState("");
  const [savingGapFill, setSavingGapFill] = useState(false);

  const supabase = createClient();

  async function handleGapFill(themeId: string) {
    if (!gapFillText.trim() || !user) return;
    setSavingGapFill(true);

    try {
      // Save as a gap_fill profile entry
      const { data: entry, error: entryError } = await supabase
        .from("profile_entries")
        .insert({
          user_id: user.id,
          entry_type: "job",
          company_name: gapFillCompany || null,
          description: gapFillText,
          source: "gap_fill",
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Save as a chunk
      await supabase.from("profile_chunks").insert({
        user_id: user.id,
        entry_id: entry.id,
        chunk_text: gapFillText,
        company_name: gapFillCompany || null,
        source: "gap_fill",
      });

      // Re-score this theme via API
      const res = await fetch("/api/analyze", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme_id: themeId,
          application_id: analysis.application_id,
          user_id: user.id,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setThemes((prev) =>
          prev.map((t) => (t.id === themeId ? { ...t, ...updated } : t))
        );
      }

      setGapFillText("");
      setGapFillCompany("");
      showSnackbar("Gap filled — theme rescored");
    } catch (err) {
      console.error("Gap fill failed:", err);
      showSnackbar("Failed to save gap fill", "error");
    } finally {
      setSavingGapFill(false);
    }
  }

  const fitScoreColor =
    analysis.fit_score >= 75
      ? "text-accent"
      : analysis.fit_score >= 50
        ? "text-warning"
        : "text-error";

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back to JD
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {analysis.company_name} — {analysis.job_title}
          </h1>
          <p className="text-muted-foreground">Gap Analysis Results</p>
        </div>
        <div className="text-right">
          <div className={cn("text-3xl font-bold", fitScoreColor)}>
            {analysis.fit_score}
          </div>
          <div className="text-sm text-muted-foreground">Fit Score</div>
        </div>
      </div>

      {/* Fit score bar */}
      <div className="mb-8 h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${analysis.fit_score}%` }}
        />
      </div>

      <div className="space-y-3">
        {themes.map((theme) => {
          const isExpanded = expandedTheme === theme.id;
          const canFill = theme.score_tier !== "strong";

          return (
            <Card key={theme.id}>
              <button
                className="flex w-full items-center justify-between p-4 text-left"
                onClick={() =>
                  setExpandedTheme(isExpanded ? null : theme.id)
                }
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {getScoreTierIcon(theme.score_tier)}
                  </span>
                  <div>
                    <div className="font-medium">{theme.theme_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Weight: {Math.round(theme.theme_weight * 100)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={theme.score_tier}
                  >
                    {theme.score_tier === "strong"
                      ? "Strong"
                      : theme.score_tier === "weak"
                        ? "Weak"
                        : "Missing"}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </div>
              </button>

              {isExpanded && (
                <CardContent className="border-t border-border pt-4">
                  <div className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground">
                    {theme.explanation}
                  </div>

                  {canFill && (
                    <div className="space-y-3 rounded-md border border-border bg-muted/50 p-4">
                      <p className="text-sm font-medium">Fill this gap</p>
                      <Input
                        placeholder="Company or project name (optional)"
                        value={gapFillCompany}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setGapFillCompany(e.target.value)
                        }
                      />
                      <Textarea
                        placeholder="Describe your relevant experience..."
                        value={gapFillText}
                        onChange={(e) => setGapFillText(e.target.value)}
                        rows={3}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleGapFill(theme.id)}
                        disabled={!gapFillText.trim() || savingGapFill}
                      >
                        {savingGapFill ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : null}
                        Save & Rescore
                      </Button>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-8 flex justify-center">
        <Button size="lg" onClick={onGenerate} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Resume...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Generate Resume
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Need to import Input for the gap fill form
import { Input } from "@/components/ui/input";
