"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Download, RefreshCw, Plus } from "lucide-react";

interface ResumeResult {
  resume_id: string;
  file_path: string;
  editorial_notes: {
    shortened?: { role: string; reason: string }[];
    omitted?: { role: string; reason: string }[];
    prioritized?: string[];
  };
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
}

export function ResumeReview({
  resume,
  analysis,
  onRegenerate,
  onNewAnalysis,
}: Props) {
  const notes = resume.editorial_notes;
  const [downloading, setDownloading] = useState(false);

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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Resume Ready</h1>
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
              <ul className="space-y-1 text-sm text-muted-foreground">
                {notes.shortened.map((item, i) => (
                  <li key={i}>
                    • <strong>{item.role}</strong>: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notes.omitted && notes.omitted.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-error">Omitted</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {notes.omitted.map((item, i) => (
                  <li key={i}>
                    • <strong>{item.role}</strong>: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleDownload} size="lg" disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {downloading ? "Exporting..." : "Download Resume (.docx)"}
        </Button>
        <Button variant="outline" onClick={onRegenerate}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Regenerate
        </Button>
        <Button variant="ghost" onClick={onNewAnalysis}>
          <Plus className="mr-2 h-4 w-4" />
          New Analysis
        </Button>
      </div>
    </div>
  );
}
