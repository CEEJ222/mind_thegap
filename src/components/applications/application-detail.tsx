"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { cn, getScoreTierIcon, getFitScoreColor } from "@/lib/utils";
import { ArrowLeft, Download } from "lucide-react";
import type { Database, InterviewStatus } from "@/lib/types/database";

type Application = Database["public"]["Tables"]["applications"]["Row"];
type Theme = Database["public"]["Tables"]["application_themes"]["Row"];
type Resume = Database["public"]["Tables"]["generated_resumes"]["Row"];

interface Props {
  application: Application;
  onBack: () => void;
  onUpdate: () => void;
}

export function ApplicationDetail({ application, onBack, onUpdate }: Props) {
  const supabase = createClient();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);

  const loadDetails = useCallback(async () => {
    const [themesRes, resumesRes] = await Promise.all([
      supabase
        .from("application_themes")
        .select("*")
        .eq("application_id", application.id)
        .order("theme_weight", { ascending: false }),
      supabase
        .from("generated_resumes")
        .select("*")
        .eq("application_id", application.id)
        .order("version", { ascending: false }),
    ]);
    if (themesRes.data) setThemes(themesRes.data);
    if (resumesRes.data) setResumes(resumesRes.data);
  }, [application.id, supabase]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  async function handleDownload(filePath: string) {
    const { data } = await supabase.storage
      .from("resumes")
      .createSignedUrl(filePath, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  }

  async function handleStatusChange(status: InterviewStatus) {
    await supabase
      .from("applications")
      .update({ interview_converted: status })
      .eq("id", application.id);
    onUpdate();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back to Applications
      </button>

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
            <option value="pending">Pending</option>
            <option value="yes">Interview</option>
            <option value="no">Rejected</option>
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
          <p className="whitespace-pre-wrap text-sm">{application.jd_text}</p>
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
                    <Badge
                      variant={theme.score_tier}
                    >
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

      {/* Resumes */}
      {resumes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Generated Resumes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resumes.map((resume) => (
              <div
                key={resume.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <span className="font-medium">Version {resume.version}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {resume.format.toUpperCase()} —{" "}
                    {new Date(resume.created_at).toLocaleDateString()}
                  </span>
                </div>
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
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
