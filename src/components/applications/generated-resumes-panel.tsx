"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Download, Eye, Sparkles } from "lucide-react";
import { ResumePreviewModal } from "@/components/resume/resume-preview-modal";
import type { Database } from "@/lib/types/database";

type Application = Database["public"]["Tables"]["applications"]["Row"];
type Resume = Database["public"]["Tables"]["generated_resumes"]["Row"];

interface Props {
  application: Application;
  onUpdate: () => void;
  /** `compact` = narrow sidebar; `full` = main column card (non-embedded detail page). */
  variant: "compact" | "full";
}

export function GeneratedResumesPanel({
  application,
  onUpdate,
  variant,
}: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [previewResumeId, setPreviewResumeId] = useState<string | null>(null);

  const loadResumes = useCallback(async () => {
    const { data } = await supabase
      .from("generated_resumes")
      .select("*")
      .eq("application_id", application.id)
      .order("version", { ascending: false });
    if (data) setResumes(data);
  }, [application.id, supabase]);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  async function handleDownload(filePath: string) {
    try {
      const fileName = `${application.company_name?.replace(/\s+/g, "_") || "resume"}_${application.job_title?.replace(/\s+/g, "_") || "role"}`;
      const res = await fetch("/api/export-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_path: filePath,
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
    }
  }

  const goGenerate = () =>
    router.push(`/generate?application_id=${application.id}`);

  const empty = (
    <div
      className={
        variant === "compact"
          ? "rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-center"
          : "flex flex-col items-center gap-3 py-6 text-center"
      }
    >
      <p className="text-xs text-muted-foreground md:text-sm">
        No resume generated yet for this application.
      </p>
      <Button
        size={variant === "compact" ? "sm" : "default"}
        onClick={goGenerate}
        className="gap-2 bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]"
      >
        <Sparkles className="h-3 w-3 md:h-4 md:w-4" />
        Generate resume
      </Button>
    </div>
  );

  const list = (
    <div className={variant === "compact" ? "space-y-2" : "space-y-2"}>
      {resumes.map((resume) => (
        <div
          key={resume.id}
          className={
            variant === "compact"
              ? "rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
              : "flex items-center justify-between rounded-md border border-border p-3"
          }
        >
          {variant === "compact" ? (
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium">
                  Version {resume.version}
                </span>
                <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                  {resume.format.toUpperCase()} ·{" "}
                  {new Date(resume.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPreviewResumeId(resume.id)}
                >
                  <Eye className="mr-1 h-3 w-3" /> Preview
                </Button>
                {resume.file_path && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleDownload(resume.file_path!)}
                  >
                    <Download className="mr-1 h-3 w-3" /> Download
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <span className="font-medium">Version {resume.version}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {resume.format.toUpperCase()} —{" "}
                  {new Date(resume.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewResumeId(resume.id)}
                >
                  <Eye className="mr-1 h-3 w-3" /> Preview
                </Button>
                {resume.file_path && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(resume.file_path!)}
                  >
                    <Download className="mr-1 h-3 w-3" /> Download
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className={variant === "compact" ? "mt-1 w-full gap-2" : "mt-2 gap-2"}
        onClick={goGenerate}
      >
        <Sparkles className="h-3 w-3" />
        Regenerate
      </Button>
    </div>
  );

  const body = resumes.length === 0 ? empty : list;

  if (variant === "compact") {
    return (
      <div className="flex min-h-0 flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Generated resumes
        </h2>
        {body}
        {previewResumeId && (
          <ResumePreviewModal
            resumeId={previewResumeId}
            onClose={() => {
              setPreviewResumeId(null);
              loadResumes();
              onUpdate();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Generated resumes</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
      {previewResumeId && (
        <ResumePreviewModal
          resumeId={previewResumeId}
          onClose={() => {
            setPreviewResumeId(null);
            loadResumes();
            onUpdate();
          }}
        />
      )}
    </Card>
  );
}
