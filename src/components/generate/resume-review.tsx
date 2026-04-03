"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, RefreshCw, Plus, Send, Eye, Undo2, Loader2 } from "lucide-react";
import { ResumePreviewModal } from "@/components/resume/resume-preview-modal";

interface EditorialNotes {
  shortened?: { role: string; reason: string; userOverride?: "keep" | "remove" | null }[];
  omitted?: { role: string; reason: string; userOverride?: "keep" | "remove" | null }[];
  prioritized?: string[];
}

interface ResumeResult {
  resume_id: string;
  file_path: string;
  editorial_notes: EditorialNotes;
}

interface AnalysisResult {
  application_id: string;
  company_name: string;
  job_title: string;
  fit_score: number;
}

interface Props {
  resume: ResumeResult;
  analysis: AnalysisResult;
  onRegenerate: () => void;
  onNewAnalysis: () => void;
  onReturnToApplication?: () => void;
  onResumeUpdate?: (resume: ResumeResult) => void;
}

export function ResumeReview({
  resume,
  analysis,
  onRegenerate,
  onNewAnalysis,
  onReturnToApplication,
  onResumeUpdate,
}: Props) {
  const notes = resume.editorial_notes;
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [activeOverride, setActiveOverride] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState("");

  async function handleDownload() {
    if (!resume.file_path) return;
    setDownloading(true);

    try {
      const fileName = `${analysis.company_name?.replace(/\s+/g, "_") || "resume"}_${analysis.job_title?.replace(/\s+/g, "_") || "role"}`;

      const res = await fetch("/api/export-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_path: resume.file_path,
          format: "docx",
          file_name: fileName,
        }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  async function handleOverride(itemLabel: string) {
    setOverriding(true);
    setActiveOverride(null);

    try {
      const res = await fetch("/api/regenerate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: analysis.application_id,
          resume_id: resume.resume_id,
          override_item: itemLabel,
          override_instruction: `User explicitly requires this item be included. Reason: ${overrideNote || "none provided"}. Include it with its strongest 2-3 bullets prioritizing the most relevant details for the target role.`,
          user_note: overrideNote || "",
        }),
      });

      if (!res.ok) throw new Error("Override regeneration failed");

      const data = await res.json();
      // Update the resume with the new data
      if (onResumeUpdate) {
        onResumeUpdate(data);
      }
    } catch (err) {
      console.error("Override failed:", err);
    } finally {
      setOverriding(false);
      setOverrideNote("");
    }
  }

  function renderOverridableItem(
    item: { role: string; reason: string; userOverride?: "keep" | "remove" | null },
    index: number,
  ) {
    const itemKey = `${item.role}-${index}`;
    const isOverridden = item.userOverride === "keep";
    const isActive = activeOverride === itemKey;

    return (
      <li key={index} className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="flex-1">
            • <strong>{item.role}</strong>: {item.reason}
            {isOverridden && (
              <span className="ml-2 text-xs font-medium text-[var(--accent)]">
                ✓ Included per your override
              </span>
            )}
          </span>
          {!isOverridden && !overriding && (
            <Button
              variant="dispute"
              size="sm"
              onClick={() => {
                setActiveOverride(isActive ? null : itemKey);
                setOverrideNote("");
              }}
            >
              Keep it <Undo2 className="h-3 w-3" />
            </Button>
          )}
        </div>
        {isActive && (
          <div className="ml-4 flex items-center gap-2">
            <Input
              placeholder="Tell us why (optional)"
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              className="h-8 flex-1 text-xs border-[var(--border-input)] bg-[var(--bg-card)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOverride(item.role);
              }}
            />
            <Button
              variant="save-rescore"
              size="sm"
              onClick={() => handleOverride(item.role)}
            >
              Save
            </Button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {previewing && (
        <ResumePreviewModal resumeId={resume.resume_id} onClose={() => setPreviewing(false)} />
      )}
      <div className="mb-6">
        <h1 className="text-xl font-bold md:text-2xl">Resume Ready</h1>
        <p className="text-muted-foreground">
          {analysis.company_name} — {analysis.job_title}
        </p>
      </div>

      {/* Editorial decisions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Editorial Decisions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(!notes.prioritized?.length && !notes.shortened?.length && !notes.omitted?.length) && (
            <p className="text-sm text-muted-foreground">No editorial changes were recorded for this resume.</p>
          )}
          {notes.prioritized && notes.prioritized.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-accent">
                Prioritized
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {notes.prioritized.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {notes.shortened && notes.shortened.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-warning">
                Shortened
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {notes.shortened.map((item, i) =>
                  renderOverridableItem(item, i)
                )}
              </ul>
            </div>
          )}

          {notes.omitted && notes.omitted.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-error">Omitted</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {notes.omitted.map((item, i) =>
                  renderOverridableItem(item, i)
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setPreviewing(true)} className="gap-2" disabled={overriding}>
          <Eye className="h-4 w-4" />
          Preview
        </Button>
        {onReturnToApplication && (
          <Button
            onClick={onReturnToApplication}
            size="lg"
            disabled={overriding}
            className="gap-2 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            <Send className="h-4 w-4" />
            Return to Application
          </Button>
        )}
        <Button
          onClick={handleDownload}
          size="lg"
          disabled={downloading || overriding}
          variant={onReturnToApplication ? "outline" : "default"}
        >
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : overriding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {downloading ? "Exporting..." : overriding ? "Regenerating..." : "Download Resume (.docx)"}
        </Button>
        <Button variant="outline" onClick={onRegenerate} disabled={overriding}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Regenerate
        </Button>
        <Button variant="ghost" onClick={onNewAnalysis} disabled={overriding}>
          <Plus className="mr-2 h-4 w-4" />
          New Analysis
        </Button>
      </div>
    </div>
  );
}
