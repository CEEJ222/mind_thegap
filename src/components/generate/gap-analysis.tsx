"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { requestEmbedProfileChunkIds } from "@/lib/embed-profile-chunks-client";
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

type ProfileEntryOption = {
  id: string;
  company_name: string | null;
  job_title: string | null;
};

function entryOptionLabel(e: ProfileEntryOption): string {
  const company = (e.company_name || "").trim() || "Untitled";
  const title = (e.job_title || "").trim();
  return title ? `${company} — ${title}` : company;
}

/** Split textarea into bullets; if there are no line breaks, treat the whole text as one bullet. */
function parseEvidenceLines(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const trimmed = text.trim();
  if (lines.length > 0) return lines;
  return trimmed ? [trimmed] : [];
}

type UserEvidenceGroup = { companyLabel: string | null; bullets: string[] };

type PendingEvidenceRow = {
  id: string;
  companyChoice: string;
  gapFillCompany: string;
  text: string;
};

function newEvidenceRow(): PendingEvidenceRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    companyChoice: "none",
    gapFillCompany: "",
    text: "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GapAnalysis({ analysis, onGenerate, generating, onBack, onUpdateAnalysis }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [disputeTheme, setDisputeTheme] = useState<string | null>(null);
  const [themes, setThemes] = useState(analysis.themes);
  /** Per-theme drafts so switching themes keeps separate queues */
  const [evidenceDraftsByTheme, setEvidenceDraftsByTheme] = useState<Record<string, PendingEvidenceRow[]>>({});
  const [profileEntries, setProfileEntries] = useState<ProfileEntryOption[]>([]);
  const [userEvidenceByTheme, setUserEvidenceByTheme] = useState<Record<string, UserEvidenceGroup[]>>({});
  const [savingGapFill, setSavingGapFill] = useState(false);

  function getEvidenceRows(themeId: string): PendingEvidenceRow[] {
    return evidenceDraftsByTheme[themeId] ?? [];
  }

  function setEvidenceRows(themeId: string, rows: PendingEvidenceRow[]) {
    setEvidenceDraftsByTheme((prev) => ({ ...prev, [themeId]: rows }));
  }

  function updateEvidenceRow(themeId: string, rowId: string, patch: Partial<PendingEvidenceRow>) {
    setEvidenceDraftsByTheme((prev) => {
      const current = prev[themeId] ?? [newEvidenceRow()];
      return {
        ...prev,
        [themeId]: current.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
      };
    });
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profile_entries")
        .select("id, company_name, job_title")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (cancelled || error) return;
      setProfileEntries((data ?? []) as ProfileEntryOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  useEffect(() => {
    if (!disputeTheme) return;
    setEvidenceDraftsByTheme((prev) => {
      if (prev[disputeTheme]?.length) return prev;
      return { ...prev, [disputeTheme]: [newEvidenceRow()] };
    });
  }, [disputeTheme]);

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
    if (!user) return;

    const rows = getEvidenceRows(themeId);
    const filled = rows.filter((r) => r.text.trim());
    if (filled.length === 0) {
      showSnackbar("Add at least one piece of evidence", "error");
      return;
    }

    for (const r of filled) {
      if (r.companyChoice === "new" && !r.gapFillCompany.trim()) {
        showSnackbar("Enter a name for each new company row, or remove that row", "error");
        return;
      }
    }

    setSavingGapFill(true);

    try {
      const newGroups: UserEvidenceGroup[] = [];
      const chunkIds: string[] = [];

      for (const row of filled) {
        const evidenceLines = parseEvidenceLines(row.text);
        if (evidenceLines.length === 0) continue;

        let entryId: string;
        let companyNameForChunk: string | null = null;
        let jobTitleForChunk: string | null = null;
        let companyLabelForUi: string | null = null;

        const chunkBody = evidenceLines.map((line) => `- ${line}`).join("\n");

        if (row.companyChoice === "none") {
          const { data: newEntry, error: entryError } = await supabase
            .from("profile_entries")
            .insert({
              user_id: user.id,
              entry_type: "job",
              company_name: null,
              description: row.text,
              source: "gap_fill",
            })
            .select("id")
            .single();
          if (entryError) throw entryError;
          entryId = newEntry.id;
          companyLabelForUi = null;
        } else if (row.companyChoice === "new") {
          const name = row.gapFillCompany.trim();
          const { data: newEntry, error: entryError } = await supabase
            .from("profile_entries")
            .insert({
              user_id: user.id,
              entry_type: "job",
              company_name: name,
              source: "gap_fill",
            })
            .select("id")
            .single();
          if (entryError) throw entryError;
          entryId = newEntry.id;
          companyNameForChunk = name;
          companyLabelForUi = name;
          setProfileEntries((prev) => [{ id: entryId, company_name: name, job_title: null }, ...prev]);
        } else {
          const selected = profileEntries.find((e) => e.id === row.companyChoice);
          if (!selected) {
            showSnackbar("A selected profile entry is no longer available — refresh and try again", "error");
            setSavingGapFill(false);
            return;
          }
          entryId = selected.id;
          companyNameForChunk = selected.company_name;
          jobTitleForChunk = selected.job_title;
          companyLabelForUi = entryOptionLabel(selected);
        }

        const { data: gapChunk, error: gapChunkError } = await supabase
          .from("profile_chunks")
          .insert({
            user_id: user.id,
            entry_id: entryId,
            chunk_text: chunkBody,
            company_name: companyNameForChunk,
            job_title: jobTitleForChunk,
            source: "gap_fill",
          })
          .select("id")
          .single();

        if (gapChunkError) throw gapChunkError;
        if (gapChunk?.id) chunkIds.push(gapChunk.id);
        newGroups.push({ companyLabel: companyLabelForUi, bullets: evidenceLines });
      }

      let embedFailed = false;
      if (chunkIds.length > 0) {
        const embedResult = await requestEmbedProfileChunkIds(chunkIds);
        embedFailed = !embedResult.ok;
        if (!embedResult.ok) {
          console.error("Embedding failed after gap fill:", embedResult.error);
        }
      }

      const res = await fetch("/api/analyze", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme_id: themeId,
          application_id: analysis.application_id,
        }),
      });

      if (!res.ok) {
        showSnackbar(
          "Evidence saved to your profile, but rescore failed. Try Save & Rescore again.",
          "error"
        );
        return;
      }

      const updated = await res.json();
      const newThemes = themes.map((t) =>
        t.id === themeId ? { ...t, ...updated } : t
      );
      setThemes(newThemes);
      const newFit = Math.round(
        newThemes.reduce((sum, t) => sum + t.score_numeric * t.theme_weight, 0) /
        Math.max(newThemes.reduce((sum, t) => sum + t.theme_weight, 0), 1)
      );
      onUpdateAnalysis({ ...analysis, themes: newThemes, fit_score: newFit });
      setUserEvidenceByTheme((prev) => ({
        ...prev,
        [themeId]: [...(prev[themeId] ?? []), ...newGroups],
      }));

      setEvidenceDraftsByTheme((prev) => ({ ...prev, [themeId]: [newEvidenceRow()] }));
      setDisputeTheme(null);
      showSnackbar(
        embedFailed
          ? "Evidence saved — theme rescored (embedding failed; check console)"
          : `Evidence saved (${newGroups.length} piece${newGroups.length === 1 ? "" : "s"}) — theme rescored`
      );
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
          const disputeRows = isDisputing ? getEvidenceRows(theme.id) : [];
          const status = getStatusText(theme.score_tier);
          const bullets = theme.explanation
            ? theme.explanation.split("\n").filter(b => b.trim())
            : [];
          const userEvidenceGroups = userEvidenceByTheme[theme.id] ?? [];

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
                      if (isDisputing) {
                        setDisputeTheme(null);
                      } else {
                        setEvidenceDraftsByTheme((prev) => ({
                          ...prev,
                          [theme.id]: prev[theme.id]?.length ? prev[theme.id]! : [newEvidenceRow()],
                        }));
                        setDisputeTheme(theme.id);
                        if (!isExpanded) setExpandedTheme(theme.id);
                      }
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
                  {(bullets.length > 0 || userEvidenceGroups.length > 0) && (
                    <div className="space-y-3">
                      {bullets.length > 0 && (
                        <ul className="space-y-1.5">
                          {bullets.map((bullet, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                              <span className={`mt-0.5 ${getArrowColor(theme.score_tier)}`}>&#8250;</span>
                              <span>{bullet.replace(/^[-•·]\s*/, "")}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {userEvidenceGroups.map((group, gi) => (
                        <div key={gi} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 p-2.5">
                          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                            {group.companyLabel ?? "Your notes"}
                          </div>
                          <ul className="space-y-1">
                            {group.bullets.map((line, bi) => (
                              <li key={bi} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                                <span className="mt-0.5 text-[var(--accent)]">&#8250;</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Gap fill panel */}
                  {isDisputing && (
                    <div className="mt-3 rounded-lg border-t border-[rgba(0,0,0,0.06)] bg-[var(--bg-overlay)] p-4">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        Show your evidence
                      </div>
                      <div className="mb-3 text-[11px] text-[var(--text-muted)]">
                        Add one or more pieces of evidence (e.g. different companies). All are saved, then the theme is rescored once.
                      </div>
                      <div className="space-y-4">
                        {disputeRows.map((row, rowIndex) => (
                          <div
                            key={row.id}
                            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                Evidence {rowIndex + 1}
                              </span>
                              {disputeRows.length > 1 && (
                                <button
                                  type="button"
                                  className="text-[10px] font-medium text-[var(--text-faint)] hover:text-red-500"
                                  onClick={() => {
                                    const next = disputeRows.filter((r) => r.id !== row.id);
                                    setEvidenceRows(theme.id, next.length > 0 ? next : [newEvidenceRow()]);
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="space-y-2">
                              <label className="block text-[10px] font-medium text-[var(--text-muted)]">
                                Link to a company
                              </label>
                              <Select
                                value={row.companyChoice}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateEvidenceRow(theme.id, row.id, {
                                    companyChoice: v,
                                    ...(v !== "new" ? { gapFillCompany: "" } : {}),
                                  });
                                }}
                                className="border-[var(--border-input)] bg-[var(--bg-base)] text-sm"
                              >
                                <option value="none">General (no specific company)</option>
                                {profileEntries.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {entryOptionLabel(e)}
                                  </option>
                                ))}
                                <option value="new">+ Add a new company…</option>
                              </Select>
                              {row.companyChoice === "new" && (
                                <Input
                                  placeholder="New company or project name"
                                  value={row.gapFillCompany}
                                  onChange={(e) =>
                                    updateEvidenceRow(theme.id, row.id, { gapFillCompany: e.target.value })
                                  }
                                  className="border-[var(--border-input)] bg-[var(--bg-base)] text-sm"
                                />
                              )}
                              <Textarea
                                placeholder="One point per line (each line becomes a bullet). Or a single paragraph."
                                value={row.text}
                                onChange={(e) => updateEvidenceRow(theme.id, row.id, { text: e.target.value })}
                                rows={3}
                                className="border-[var(--border-input)] bg-[var(--bg-base)] text-sm"
                              />
                            </div>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full border-[var(--border-input)] text-xs"
                          onClick={() =>
                            setEvidenceRows(theme.id, [...disputeRows, newEvidenceRow()])
                          }
                        >
                          + Add another piece of evidence
                        </Button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-[var(--text-faint)]">
                          Saves to your profile permanently
                        </span>
                        <Button
                          variant="save-rescore"
                          onClick={() => handleGapFill(theme.id)}
                          disabled={!disputeRows.some((r) => r.text.trim()) || savingGapFill}
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

      {/* Spacer so sticky FAB doesn't cover content */}
      <div className="h-20 md:h-16" />

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
