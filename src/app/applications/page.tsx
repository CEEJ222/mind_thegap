"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn, getFitScoreColor } from "@/lib/utils";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { Briefcase } from "lucide-react";
import type { Database, InterviewStatus } from "@/lib/types/database";

type Application = Database["public"]["Tables"]["applications"]["Row"];

export default function ApplicationsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
            <div className="col-span-4">Company & Role</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-center">Fit Score</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-2 text-center">Resume</div>
          </div>

          {applications.map((app) => (
            <Card
              key={app.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => setSelectedId(app.id)}
            >
              <CardContent className="grid grid-cols-12 items-center gap-4 p-4">
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
                    <span
                      className={cn(
                        "text-lg font-bold",
                        getFitScoreColor(app.fit_score)
                      )}
                    >
                      {app.fit_score}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div
                  className="col-span-2 text-center"
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
                    className="h-8 text-xs"
                  >
                    <option value="pending">Pending</option>
                    <option value="yes">Interview</option>
                    <option value="no">Rejected</option>
                  </Select>
                </div>
                <div className="col-span-2 text-center text-sm text-accent">
                  View
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
