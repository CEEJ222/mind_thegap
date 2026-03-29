"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload } from "lucide-react";
import { BulkJobCard, type BulkJob } from "./bulk-job-card";

interface BatchStatus {
  batch: {
    id: string;
    status: string;
    total_count: number;
    completed_count: number;
    failed_count: number;
  };
  jobs: BulkJob[];
}

export function BulkImport() {
  const { user } = useAuth();
  const [urlText, setUrlText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parse URLs from text
  const urls = urlText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("linkedin.com"));
  const validCount = urls.length;
  const tooMany = validCount > 10;

  // Poll for status updates
  const pollStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/bulk-status?batchId=${id}`);
      if (!res.ok) return;
      const data: BatchStatus = await res.json();
      setBatchStatus(data);

      // Stop polling when batch is completed
      if (data.batch.status === "completed") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // Silently retry on next poll
    }
  }, []);

  useEffect(() => {
    if (!batchId) return;

    // Initial fetch
    pollStatus(batchId);

    // Poll every 3 seconds
    pollRef.current = setInterval(() => pollStatus(batchId), 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [batchId, pollStatus]);

  async function handleSubmit() {
    if (!user || validCount === 0 || tooMany) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBatchId(data.batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start import");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetry(jobId: string) {
    setRetryingId(jobId);
    try {
      const res = await fetch("/api/bulk-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      // Restart polling if it stopped
      if (batchId && !pollRef.current) {
        pollRef.current = setInterval(() => pollStatus(batchId), 3000);
      }
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setRetryingId(null);
    }
  }

  function handleReset() {
    setBatchId(null);
    setBatchStatus(null);
    setUrlText("");
    setError(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Processing state — show job cards
  if (batchId && batchStatus) {
    const { batch, jobs } = batchStatus;
    const isDone = batch.status === "completed";
    const progress = batch.completed_count + batch.failed_count;

    return (
      <div className="w-full space-y-4">
        {/* Progress header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {isDone ? "Bulk Import Complete" : "Processing..."}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {progress} of {batch.total_count} jobs processed
              {batch.failed_count > 0 &&
                ` (${batch.failed_count} failed)`}
            </p>
          </div>
          {isDone && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              New Batch
            </Button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-[var(--bg-card)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#3DD9B3] transition-all duration-500"
            style={{
              width: `${batch.total_count > 0 ? (progress / batch.total_count) * 100 : 0}%`,
            }}
          />
        </div>

        {/* Job cards */}
        <div className="space-y-2">
          {jobs.map((job) => (
            <BulkJobCard
              key={job.id}
              job={job}
              onRetry={handleRetry}
              retrying={retryingId === job.id}
            />
          ))}
        </div>
      </div>
    );
  }

  // Waiting for initial poll after submit
  if (batchId && !batchStatus) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Starting bulk import...
        </p>
      </div>
    );
  }

  // Input state
  return (
    <div className="w-full space-y-4">
      <Textarea
        placeholder={`Paste LinkedIn job URLs (one per line)\nhttps://linkedin.com/jobs/view/123\nhttps://linkedin.com/jobs/view/456`}
        value={urlText}
        onChange={(e) => {
          setUrlText(e.target.value);
          setError(null);
        }}
        rows={6}
        className="resize-none border-[var(--border-input)] bg-[var(--bg-card)] text-base placeholder:text-[var(--text-faint)] font-mono text-sm"
        style={{ minHeight: "160px" }}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {validCount > 0 ? (
            <span className={tooMany ? "text-red-500" : ""}>
              {validCount} URL{validCount !== 1 ? "s" : ""} detected
              {tooMany && " (max 10)"}
            </span>
          ) : (
            "Paste LinkedIn job URLs above"
          )}
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={validCount === 0 || tooMany || submitting}
        className="w-full"
        size="lg"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Start Bulk Import — {validCount} job{validCount !== 1 ? "s" : ""}
          </>
        )}
      </Button>
    </div>
  );
}
