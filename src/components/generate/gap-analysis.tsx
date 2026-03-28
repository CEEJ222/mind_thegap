"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
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
  onUpdateAnalysis: (updated: AnalysisResult) => void;
}

function StatusIcon({ tier }: { tier: ScoreTier }) {
  if (tier === "strong") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(61,217,179,0.2)]">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#0F6E56" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (tier === "weak") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(245,158,11,0.15)]">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M6 3V6.5M6 8.5V9" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(0,0,0,0.08)]">
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="#8C7E6A" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function getLeftBorderColor(tier: ScoreTier) {
  switch (tier) {
    case "strong": return "border-l-[var(--accent)]";
    case "weak": return "border-l-[var(--amber)]";
    case "none": return "border-l-[rgba(0,0,0,0.15)]";
  }
}

function getScoreBarColor(tier: ScoreTier) {
  switch (tier) {
    case "strong": return "bg-[var(--accent)]";
    case "weak": return "bg-[var(--amber)]";
    case "none": return "bg-[rgba(0,0,0,0.15)]";
  }
}

function getStatusText(tier: ScoreTier) {
  switch (tier) {
    case "strong": return { label: "Strong", className: "text-[var(--accent)]" };
    case "weak": return { label: "Partial", className: "text-[var(--amber-text)]" };
    case "none": return { label: "Missing", className: "text-[var(--text-muted)]" };
  }
}

function getArrowColor(tier: ScoreTier) {
  switch (tier) {
    case "strong": return "text-[var(--accent)]";
    case "weak": return "text-[var(--amber-text)]";
    case "none": return "text-[var(--text-muted)]";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GapAnalysis({ analysis, onGenerate, generating, onBack, onUpdateAnalysis }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [disputeTheme, setDisputeTheme] = useState<string | null>(null);
  const [themes, setThemes] = useState(analysis.themes);
  const [gapFillText, setGapFillText] = useState("");
  const [gapFillCompany, setGapFillCompany] = useState("");
  const [savingGapFill, setSavingGapFill] = useState(false);

  const strongCount = themes.filter(t => t.score_tier === "strong").length;
  const weakCount = themes.filter(t => t.score_tier === "weak").length;
  const noneCount = themes.filter(t => t.score_tier === "none").length;
  const gapsRemaining = weakCount + noneCount;

  // Calculate current fit score from themes
  const currentFitScore = Math.round(
    themes.reduce((sum, t) => sum + t.score_numeric * t.theme_weight, 0) /
    Math.max(themes.reduce((sum, t) => sum + t.theme_weight, 0), 1)
  );

  const progressPercent = themes.length > 0
    ? Math.round((strongCount / themes.length) * 100)
    : 0;

  async function handleGapFill(themeId: string) {
    if (!gapFillText.trim() || !user) return;
    setSavingGapFill(true);

    try {
      let entryId: string;

      // Try to find an existing entry at this company
      if (gapFillCompany) {
        const { data: existing } = await supabase
          .from("profile_entries")
          .select("id, company_name")
          .eq("user_id", user.id);

        const normalizedNew = gapFillCompany.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const match = (existing ?? []).find((e: { company_name: string | null }) => {
          const n = (e.company_name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          return n === normalizedNew || n.includes(normalizedNew) || normalizedNew.includes(n) ||
            (n.split(" ")[0]?.length > 2 && n.split(" ")[0] === normalizedNew.split(" ")[0]);
        });

        if (match) {
          entryId = match.id;
        } else {
          const { data: newEntry, error: entryError } = await supabase
            .from("profile_entries")
            .insert({
              user_id: user.id,
              entry_type: "job",
              company_name: gapFillCompany,
              source: "gap_fill",
            })
            .select("id")
            .single();
          if (entryError) throw entryError;
          entryId = newEntry.id;
        }
      } else {
        // No company specified — create a standalone entry
        const { data: newEntry, error: entryError } = await supabase
          .from("profile_entries")
          .insert({
            user_id: user.id,
            entry_type: "job",
            company_name: null,
            description: gapFillText,
            source: "gap_fill",
          })
          .select("id")
          .single();
        if (entryError) throw entryError;
        entryId = newEntry.id;
      }

      await supabase.from("profile_chunks").insert({
        user_id: user.id,
        entry_id: entryId,
        chunk_text: gapFillText,
        company_name: gapFillCompany || null,
        source: "gap_fill",
      });

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
        const newThemes = themes.map((t) =>
          t.id === themeId ? { ...t, ...updated } : t
        );
        setThemes(newThemes);
        // Recalculate fit score and propagate up
        const newFit = Math.round(
          newThemes.reduce((sum, t) => sum + t.score_numeric * t.theme_weight, 0) /
          Math.max(newThemes.reduce((sum, t) => sum + t.theme_weight, 0), 1)
        );
        onUpdateAnalysis({ ...analysis, themes: newThemes, fit_score: newFit });
      }

      setGapFillText("");
      setGapFillCompany("");
      setDisputeTheme(null);
      showSnackbar("Gap filled — theme rescored");
    } catch (err) {
      console.error("Gap fill failed:", err);
      showSnackbar("Failed to save gap fill", "error");
    } finally {
      setSavingGapFill(false);
    }
  }

  return (
    <div className="relative px-4 pb-4 pt-4 md:px-9 md:pt-6 md:pb-6">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-[var(--text-muted)]">{themes.length} themes analyzed</span>
          <span className="text-[var(--text-muted)]">
            <span className="text-[var(--accent)]">{strongCount} strong</span>
            {" · "}
            <span className="text-[var(--amber-text)]">{weakCount} partial</span>
            {" · "}
            <span>{noneCount} missing</span>
          </span>
        </div>
        <div className="h-[5px] w-full overflow-hidden rounded-[3px] bg-[rgba(0,0,0,0.08)]">
          <div
            className="h-full rounded-[3px] bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Theme cards */}
      <div className="space-y-3">
        {themes.map((theme) => {
          const isExpanded = expandedTheme === theme.id;
          const isDisputing = disputeTheme === theme.id;
          const status = getStatusText(theme.score_tier);
          const bullets = theme.explanation
            ? theme.explanation.split("\n").filter(b => b.trim())
            : [];

          return (
            <div
              key={theme.id}
              className={`overflow-hidden rounded-[12px] border border-[var(--border-subtle)] border-l-[3px] bg-[var(--bg-card)] ${getLeftBorderColor(theme.score_tier)}`}
            >
              {/* Card header */}
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpandedTheme(isExpanded ? null : theme.id)}
              >
                <StatusIcon tier={theme.score_tier} />
                <span className="min-w-0 flex-1 text-[13px] font-semibold text-[var(--text-primary)]">
                  {theme.theme_name}
                </span>
                <span className={`hidden sm:inline text-[11px] font-medium ${status.className}`}>
                  {status.label}
                </span>
                {theme.score_tier !== "strong" && (
                  <Button
                    variant="dispute"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDisputeTheme(isDisputing ? null : theme.id);
                      if (!isExpanded) setExpandedTheme(theme.id);
                    }}
                  >
                    Dispute
                  </Button>
                )}
                <span className="ml-1 min-w-[28px] text-right text-[13px] font-bold text-[var(--text-primary)]">
                  {theme.score_numeric}
                </span>
                {isExpanded ? (
                  <ChevronUp size={14} className="text-[var(--text-faint)]" />
                ) : (
                  <ChevronDown size={14} className="text-[var(--text-faint)]" />
                )}
              </button>

              {/* Score bar */}
              <div className="mx-4">
                <div className="h-[2px] w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getScoreBarColor(theme.score_tier)}`}
                    style={{ width: `${theme.score_numeric}%` }}
                  />
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-3 pt-3">
                  {bullets.length > 0 && (
                    <ul className="space-y-1.5">
                      {bullets.map((bullet, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#5A5045]">
                          <span className={`mt-0.5 ${getArrowColor(theme.score_tier)}`}>&#8250;</span>
                          <span>{bullet.replace(/^[-•·]\s*/, "")}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Gap fill panel */}
                  {isDisputing && (
                    <div className="mt-3 rounded-lg border-t border-[rgba(0,0,0,0.06)] bg-[var(--bg-overlay)] p-4">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        Show your evidence
                      </div>
                      <div className="mb-3 text-[11px] text-[var(--text-muted)]">
                        Tell the AI what it missed. This gets saved to your profile.
                      </div>
                      <div className="space-y-2">
                        <Input
                          placeholder="Company or project name (optional)"
                          value={gapFillCompany}
                          onChange={(e) => setGapFillCompany(e.target.value)}
                          className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                        />
                        <Textarea
                          placeholder="Describe your relevant experience..."
                          value={gapFillText}
                          onChange={(e) => setGapFillText(e.target.value)}
                          rows={3}
                          className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-[var(--text-faint)]">
                          Saves to your profile permanently
                        </span>
                        <Button
                          variant="save-rescore"
                          onClick={() => handleGapFill(theme.id)}
                          disabled={!gapFillText.trim() || savingGapFill}
                        >
                          {savingGapFill ? (
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          ) : null}
                          Save & Rescore
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Generate Resume FAB */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/95 px-4 py-3 backdrop-blur-sm md:-mx-9 md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none md:absolute md:bottom-6 md:right-9 md:left-auto md:mt-0 flex flex-col items-center gap-1 md:items-end">
        <span className="text-[11px] text-[var(--text-muted)]">
          Score: {currentFitScore} · {gapsRemaining} gap{gapsRemaining !== 1 ? "s" : ""} remaining
        </span>
        <Button
          variant="fab"
          onClick={onGenerate}
          disabled={generating}
          className="w-full md:w-auto"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Resume"
          )}
        </Button>
      </div>
    </div>
  );
}
