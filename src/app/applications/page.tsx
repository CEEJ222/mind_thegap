"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn, getFitScoreColor } from "@/lib/utils";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { GeneratedResumesPanel } from "@/components/applications/generated-resumes-panel";
import { Briefcase, Send, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Database, InterviewStatus } from "@/lib/types/database";

type Application = Database["public"]["Tables"]["applications"]["Row"];

const ATS_TYPES = new Set(["lever", "greenhouse", "ashby"]);

export default function ApplicationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setApplications(data);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  // Deep-linked selection — /applications?id={uuid} opens that application when
  // valid (Chrome extension "Open in jobseek.fyi"). Otherwise default to first.
  useEffect(() => {
    if (applications.length === 0) {
      setSelectedId(null);
      return;
    }
    const idFromUrl = searchParams.get("id");
    if (idFromUrl && applications.some((a) => a.id === idFromUrl)) {
      setSelectedId(idFromUrl);
      return;
    }
    setSelectedId((prev) => {
      if (prev && applications.some((a) => a.id === prev)) return prev;
      return applications[0].id;
    });
  }, [applications, searchParams]);

  async function handleStatusChange(appId: string, status: InterviewStatus) {
    await supabase
      .from("applications")
      .update({ interview_converted: status })
      .eq("id", appId);
    loadApplications();
  }

  async function handleDelete(appId: string) {
    await supabase.from("applications").delete().eq("id", appId);
    setDeletingId(null);
    loadApplications();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const selectedApp = selectedId
    ? applications.find((a) => a.id === selectedId)
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-2 text-2xl font-bold">Applications</h1>
      <p className="mb-8 text-muted-foreground">
        Track every job you&apos;ve analyzed. Select an application to see full
        details.
      </p>

      {applications.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Briefcase className="mx-auto mb-4 h-12 w-12" />
          <p>No applications yet. Analyze a job description to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-6 md:flex-row md:gap-8">
          {/* Main column — detail */}
          <div className="min-w-0 flex-1">
            {selectedApp ? (
              <ApplicationDetail
                embedded
                application={selectedApp}
                onUpdate={loadApplications}
              />
            ) : null}
          </div>

          {/* Side column — applications + generated resumes (matches profile sidebar) */}
          <div className="w-full shrink-0 md:w-[300px]">
            <div className="flex flex-col gap-6 md:sticky md:top-6 md:max-h-[calc(100vh-120px)] md:min-h-0">
              <div className="flex min-h-0 flex-col gap-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Your applications
                </h2>
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-0.5 md:max-h-[min(40vh,320px)]">
                {applications.map((app) => {
                  const isSel = app.id === selectedId;
                  return (
                    <Card
                      key={app.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(app.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(app.id);
                        }
                      }}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSel
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/40"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-[var(--text-primary)]">
                              {app.company_name || "Unknown Company"}
                            </div>
                            <div className="truncate text-xs text-[var(--text-muted)]">
                              {app.job_title || "Unknown Role"}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                              {new Date(app.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          {app.fit_score !== null && (
                            <span
                              className={cn(
                                "shrink-0 text-lg font-bold leading-none",
                                getFitScoreColor(app.fit_score)
                              )}
                            >
                              {app.fit_score}
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Select
                            value={app.interview_converted}
                            onChange={(e) =>
                              handleStatusChange(
                                app.id,
                                e.target.value as InterviewStatus
                              )
                            }
                            className="h-auto min-h-8 min-w-0 flex-1 py-1.5 pl-2 pr-7 text-xs leading-normal"
                          >
                            <option value="pending">Created</option>
                            <option value="applied">Applied</option>
                            <option value="yes">Interview</option>
                            <option value="no">Rejected</option>
                            <option value="closed">Closed</option>
                          </Select>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {ATS_TYPES.has(app.source_type || "") && (
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(`/apply?applicationId=${app.id}`)
                                }
                                title="Apply"
                                className="rounded-md p-1.5 text-[var(--text-faint)] hover:text-[var(--accent)]"
                              >
                                <Send size={14} />
                              </button>
                            )}
                            {deletingId === app.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(app.id)}
                                  className="h-7 px-2 text-xs"
                                >
                                  Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeletingId(null)}
                                  className="h-7 px-2 text-xs"
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(app.id)}
                                className="rounded-md p-1.5 text-[var(--text-faint)] hover:text-[var(--red-muted)]"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                </div>
              </div>

              {selectedApp ? (
                <div className="min-h-0 shrink-0 border-t border-[var(--border-subtle)] pt-4 md:flex-1 md:overflow-y-auto md:border-t-0 md:pt-0">
                  <GeneratedResumesPanel
                    variant="compact"
                    application={selectedApp}
                    onUpdate={loadApplications}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
