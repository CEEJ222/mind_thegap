"use client";

import { Loader2, CheckCircle2, X, AlertCircle } from "lucide-react";

export type QueueItemStatus = "pending" | "analyzing" | "generating" | "done" | "error";

export interface QueueItem {
  id: string;
  jdText: string;
  label: string;
  status: QueueItemStatus;
  error?: string;
}

interface JdQueueProps {
  items: QueueItem[];
  batchRunning: boolean;
  batchProgress: number;
  onRemove: (id: string) => void;
}

function StatusIndicator({ status, error }: { status: QueueItemStatus; error?: string }) {
  switch (status) {
    case "analyzing":
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing...
        </span>
      );
    case "generating":
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating...
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1.5 text-xs text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Done
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1.5 text-xs text-red-500" title={error}>
          <AlertCircle className="h-3.5 w-3.5" />
          Failed
        </span>
      );
    default:
      return (
        <span className="text-xs text-[var(--text-faint)]">Pending</span>
      );
  }
}

export function JdQueue({ items, batchRunning, batchProgress, onRemove }: JdQueueProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--text-muted)]">
          Queue ({items.length} job{items.length !== 1 ? "s" : ""})
        </p>
        {batchRunning && (
          <p className="text-xs text-[var(--text-muted)]">
            {batchProgress} / {items.length}
          </p>
        )}
      </div>

      {batchRunning && (
        <div className="h-1.5 rounded-full bg-[var(--border-subtle)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${(batchProgress / items.length) * 100}%` }}
          />
        </div>
      )}

      <div className="space-y-1">
        {items.map((item, i) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
          >
            <span className="shrink-0 text-xs font-medium text-[var(--text-faint)] w-5 text-right">
              {i + 1}
            </span>
            <span className="flex-1 truncate text-sm text-[var(--text-primary)]">
              {item.label}
            </span>
            <StatusIndicator status={item.status} error={item.error} />
            {item.status === "pending" && !batchRunning && (
              <button
                onClick={() => onRemove(item.id)}
                className="shrink-0 text-[var(--text-faint)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
