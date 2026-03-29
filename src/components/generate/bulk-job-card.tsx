"use client";

import { Button } from "@/components/ui/button";
import {
  Clock,
  Search,
  BarChart3,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

export interface BulkJob {
  id: string;
  url: string;
  status: string;
  job_title: string | null;
  company_name: string | null;
  fit_score: number | null;
  resume_url: string | null;
  application_id: string | null;
  error_message: string | null;
}

interface BulkJobCardProps {
  job: BulkJob;
  onRetry: (jobId: string) => void;
  retrying: boolean;
}

const STATUS_CONFIG: Record<
  string,
  {
    icon: React.ReactNode;
    label: string;
    color: string;
    bgColor: string;
    spinning?: boolean;
  }
> = {
  queued: {
    icon: <Clock className="h-4 w-4" />,
    label: "Queued",
    color: "text-[var(--text-muted)]",
    bgColor: "border-[var(--border)]",
  },
  fetching: {
    icon: <Search className="h-4 w-4" />,
    label: "Fetching job details...",
    color: "text-[#3DD9B3]",
    bgColor: "border-[#3DD9B3]/30",
    spinning: true,
  },
  analyzing: {
    icon: <BarChart3 className="h-4 w-4" />,
    label: "Analyzing fit...",
    color: "text-[#3DD9B3]",
    bgColor: "border-[#3DD9B3]/30",
    spinning: true,
  },
  generating: {
    icon: <FileText className="h-4 w-4" />,
    label: "Generating resume...",
    color: "text-[#3DD9B3]",
    bgColor: "border-[#3DD9B3]/30",
    spinning: true,
  },
  ready: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: "Ready",
    color: "text-green-500",
    bgColor: "border-green-500/30",
  },
  failed: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Failed",
    color: "text-red-500",
    bgColor: "border-red-500/30",
  },
};

export function BulkJobCard({ job, onRetry, retrying }: BulkJobCardProps) {
  const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
  const isProcessing = ["fetching", "analyzing", "generating"].includes(
    job.status
  );

  return (
    <div
      className={`rounded-lg border bg-[var(--bg-card)] p-4 transition-all ${config.bgColor}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: status + info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`mt-0.5 shrink-0 ${config.color}`}>
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              config.icon
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${config.color}`}>
                {job.status === "ready" && job.fit_score != null
                  ? `${job.fit_score}`
                  : config.label}
              </span>
              {job.status === "ready" && job.fit_score != null && (
                <span className="text-xs text-[var(--text-muted)]">
                  fit score
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-primary)] truncate mt-0.5">
              {job.job_title && job.company_name
                ? `${job.job_title} — ${job.company_name}`
                : job.job_title || job.company_name || config.label}
            </p>
            {job.status === "failed" && job.error_message && (
              <p className="text-xs text-red-400 mt-1">{job.error_message}</p>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {job.status === "ready" && (
            <>
              {job.resume_url && (
                <a
                  href={job.resume_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors border border-[var(--border-input)] bg-transparent hover:bg-[var(--bg-card)] h-8 px-3"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </a>
              )}
              {job.application_id && (
                <a
                  href={`/generate?application_id=${job.application_id}`}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors border border-[var(--border-input)] bg-transparent hover:bg-[var(--bg-card)] h-8 px-3"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Details
                </a>
              )}
            </>
          )}
          {job.status === "failed" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onRetry(job.id)}
              disabled={retrying}
            >
              {retrying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Retry
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
