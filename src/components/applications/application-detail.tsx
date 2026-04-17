"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { cn, getScoreTierIcon, getFitScoreColor } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import type { Database, InterviewStatus } from "@/lib/types/database";
import { GeneratedResumesPanel } from "@/components/applications/generated-resumes-panel";
import { ScreeningQuestionsPanel } from "@/components/applications/screening-questions-panel";

type Application = Database["public"]["Tables"]["applications"]["Row"];
type Theme = Database["public"]["Tables"]["application_themes"]["Row"];

interface Props {
  application: Application;
  /** When true, used inside the applications two-column layout (no back link; generated resumes live in the sidebar). */
  embedded?: boolean;
  onBack?: () => void;
  onUpdate: () => void;
}

export function ApplicationDetail({
  application,
  embedded = false,
  onBack,
  onUpdate,
}: Props) {
  const supabase = createClient();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [jdExpanded, setJdExpanded] = useState(false);
  const [jdSummary, setJdSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadThemes = useCallback(async () => {
    const { data } = await supabase
      .from("application_themes")
      .select("*")
      .eq("application_id", application.id)
      .order("theme_weight", { ascending: false });
    if (data) setThemes(data);
  }, [application.id, supabase]);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  useEffect(() => {
    if (!application.jd_text) return;
    setSummaryLoading(true);
    fetch("/api/summarize-jd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: application.id,
        jd_text: application.jd_text,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.summary) setJdSummary(d.summary);
      })
      .finally(() => setSummaryLoading(false));
  }, [application.id, application.jd_text]);

  async function handleStatusChange(status: InterviewStatus) {
    await supabase
      .from("applications")
      .update({ interview_converted: status })
      .eq("id", application.id);
    onUpdate();
  }

  return (
    <div className={embedded ? "w-full min-w-0" : "mx-auto max-w-4xl"}>
      {!embedded && onBack && (
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back to Applications
        </button>
      )}

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {application.company_name || "Unknown Company"}
          </h1>
          <p className="text-muted-foreground">
            {application.job_title || "Unknown Role"}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(application.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select
            value={application.interview_converted}
            onChange={(e) =>
              handleStatusChange(e.target.value as InterviewStatus)
            }
            className="w-32"
          >
            <option value="pending">Created</option>
            <option value="applied">Applied</option>
            <option value="yes">Interview</option>
            <option value="no">Rejected</option>
            <option value="closed">Closed</option>
          </Select>
          {application.fit_score !== null && (
            <div className="text-right">
              <div
                className={cn(
                  "text-3xl font-bold",
                  getFitScoreColor(application.fit_score)
                )}
              >
                {application.fit_score}
              </div>
              <div className="text-xs text-muted-foreground">Fit Score</div>
            </div>
          )}
        </div>
      </div>

      {/* JD */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Job Description</CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading && (
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-3 w-3 animate-spin rounded-full border border-[var(--accent)] border-t-transparent" />
              Summarizing…
            </div>
          )}
          {jdSummary && !summaryLoading && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2">
              <span className="mt-0.5 text-xs text-[var(--accent)]">✦</span>
              <p className="text-sm italic text-[var(--text-muted)]">
                {jdSummary}
              </p>
            </div>
          )}
          <div className={jdExpanded ? "" : "relative"}>
            <p
              className={`whitespace-pre-wrap text-sm ${
                jdExpanded ? "" : "line-clamp-3"
              }`}
            >
              {application.jd_text}
            </p>
            {!jdExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--bg-card,white)] to-transparent" />
            )}
          </div>
          <button
            onClick={() => setJdExpanded(!jdExpanded)}
            className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {jdExpanded ? "Show less" : "Show full description"}
          </button>
        </CardContent>
      </Card>

      {/* Themes */}
      {themes.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Gap Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {themes.map((theme) => (
              <div
                key={theme.id}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <span className="mt-0.5 text-lg">
                  {getScoreTierIcon(theme.score_tier)}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{theme.theme_name}</span>
                    <Badge variant={theme.score_tier}>
                      {theme.score_numeric}/100
                    </Badge>
                  </div>
                  {theme.explanation && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {theme.explanation}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!embedded && (
        <GeneratedResumesPanel
          variant="full"
          application={application}
          onUpdate={onUpdate}
        />
      )}

      <div className="mt-6">
        <ScreeningQuestionsPanel application={application} />
      </div>
    </div>
  );
}
