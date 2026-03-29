"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn, getFitScoreColor } from "@/lib/utils";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { Briefcase, Clock, Trash2 } from "lucide-react";
import type { Database, InterviewStatus } from "@/lib/types/database";

type Application = Database["public"]["Tables"]["applications"]["Row"];

export default function ApplicationsPage() {
  const { user } = useAuth();
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

  async function handleStatusChange(appId: string, status: InterviewStatus) {
    await supabase
      .from("applications")
      .update({ interview_converted: status })
      .eq("id", appId);
    loadApplications();
  }

  async function handleDelete(appId: string) {
    // Themes and resumes cascade via FK
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

  if (selectedId) {
    const app = applications.find((a) => a.id === selectedId);
    if (app) {
      return (
        <ApplicationDetail
          application={app}
          onBack={() => setSelectedId(null)}
          onUpdate={loadApplications}
        />
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">Applications</h1>
      <p className="mb-8 text-muted-foreground">
        Track every job you&apos;ve analyzed. Click a row to see the full details.
      </p>

      {applications.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Briefcase className="mx-auto mb-4 h-12 w-12" />
          <p>No applications yet. Analyze a job description to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Desktop header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
            <div className="col-span-4">Company & Role</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-center">Fit Score</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-2 text-center">Actions</div>
          </div>

          {applications.map((app) => (
            <Card
              key={app.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => setSelectedId(app.id)}
            >
              {/* Desktop row */}
              <CardContent className="hidden md:grid grid-cols-12 items-center gap-4 p-4">
                <div className="col-span-4">
                  <div className="font-medium">
                    {app.company_name || "Unknown Company"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {app.job_title || "Unknown Role"}
                  </div>
                </div>
                <div className="col-span-2 text-sm text-muted-foreground">
                  {new Date(app.created_at).toLocaleDateString()}
                </div>
                <div className="col-span-2 text-center">
                  {app.fit_score !== null ? (
                    <span className={cn("text-lg font-bold", getFitScoreColor(app.fit_score))}>
                      {app.fit_score}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="col-span-2 text-center" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={app.interview_converted}
                    onChange={(e) => handleStatusChange(app.id, e.target.value as InterviewStatus)}
                    className="h-8 text-xs"
                  >
                    <option value="pending">Pending</option>
                    <option value="yes">Interview</option>
                    <option value="no">Rejected</option>
                  </Select>
                </div>
                <div className="col-span-2 flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {deletingId === app.id ? (
                    <>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(app.id)} className="h-7 px-2 text-xs">Confirm</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)} className="h-7 px-2 text-xs">Cancel</Button>
                    </>
                  ) : (
                    <button onClick={() => setDeletingId(app.id)} className="rounded-md p-1.5 text-[var(--text-faint)] hover:text-[var(--red-muted)]">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </CardContent>

              {/* Mobile card */}
              <CardContent className="md:hidden p-4">
                <div className="flex gap-3">
                  {/* Company avatar */}
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
                    style={{
                      background: "linear-gradient(135deg, #F6D365 0%, #FDA085 40%, #A18CD1 70%, #5FC3E4 100%)",
                    }}
                  >
                    <span className="text-sm font-bold text-white">
                      {(app.company_name || "?")[0].toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-tight text-[var(--text-primary)] truncate">
                          {app.company_name || "Unknown Company"}
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] truncate">
                          {app.job_title || "Unknown Role"}
                        </p>
                      </div>
                      {app.fit_score !== null && (
                        <span className={cn("text-2xl font-bold flex-shrink-0 ml-3", getFitScoreColor(app.fit_score))}>
                          {app.fit_score}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-faint)]">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(app.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={app.interview_converted}
                    onChange={(e) => handleStatusChange(app.id, e.target.value as InterviewStatus)}
                    className="h-auto py-1.5 text-xs leading-normal flex-1 min-w-0"
                  >
                    <option value="pending">Pending</option>
                    <option value="yes">Interview</option>
                    <option value="no">Rejected</option>
                  </Select>
                  {deletingId === app.id ? (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(app.id)} className="h-8 px-2 text-xs">Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)} className="h-8 px-2 text-xs">Cancel</Button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingId(app.id)} className="flex-shrink-0 rounded-md p-1.5 text-[var(--text-faint)] hover:text-[var(--red-muted)]">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
