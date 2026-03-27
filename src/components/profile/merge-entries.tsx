"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import { formatDate } from "@/lib/utils";
import { Merge, Check, X, ArrowRight } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chunks: any[];
  onComplete: () => void;
  onCancel: () => void;
}

export function MergeEntries({ entries, chunks, onComplete, onCancel }: Props) {
  const supabase = createClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [keepId, setKeepId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // Replace oldest selection
      return [...prev, id];
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getChunksForEntry(entryId: string): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chunks.filter((c: any) => c.entry_id === entryId);
  }

  async function handleMerge() {
    if (!keepId || selectedIds.length !== 2) return;
    setMerging(true);

    const removeId = selectedIds.find((id) => id !== keepId)!;
    const chunksToMove = getChunksForEntry(removeId);

    try {
      // Move chunks from removed entry to kept entry (skip duplicates)
      const keptChunks = getChunksForEntry(keepId);
      const keptTexts = new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        keptChunks.map((c: any) => c.chunk_text.toLowerCase().trim())
      );

      for (const chunk of chunksToMove) {
        if (!keptTexts.has(chunk.chunk_text.toLowerCase().trim())) {
          await supabase
            .from("profile_chunks")
            .update({ entry_id: keepId })
            .eq("id", chunk.id);
        } else {
          // Duplicate — delete it
          await supabase.from("profile_chunks").delete().eq("id", chunk.id);
        }
      }

      // Delete the removed entry (remaining chunks already moved)
      await supabase.from("profile_entries").delete().eq("id", removeId);

      showSnackbar("Entries merged successfully");
      onComplete();
    } catch (err) {
      console.error("Merge failed:", err);
      showSnackbar("Failed to merge entries", "error");
    } finally {
      setMerging(false);
    }
  }

  const selectedEntries = entries.filter((e: { id: string }) =>
    selectedIds.includes(e.id)
  );

  if (step === "confirm" && selectedEntries.length === 2) {
    return (
      <div>
        <h3 className="mb-2 text-lg font-semibold">Merge Entries</h3>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Which entry&apos;s title and dates should be kept? Bullets from both will be combined.
        </p>

        <div className="space-y-3">
          {selectedEntries.map((entry: { id: string; company_name: string; job_title: string; date_start: string | null; date_end: string | null }) => {
            const isKept = keepId === entry.id;
            const entryChunks = getChunksForEntry(entry.id);

            return (
              <button
                key={entry.id}
                onClick={() => setKeepId(entry.id)}
                className={`w-full rounded-[12px] border-2 p-4 text-left transition-all ${
                  isKept
                    ? "border-[var(--accent)] bg-[var(--accent)]/5"
                    : "border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      {entry.company_name}
                    </div>
                    <div className="text-sm text-[var(--text-muted)]">
                      {entry.job_title}
                    </div>
                    <div className="text-xs text-[var(--text-faint)]">
                      {formatDate(entry.date_start)} — {formatDate(entry.date_end)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-faint)]">
                      {entryChunks.length} bullets
                    </span>
                    {isKept && (
                      <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-bold text-white">
                        Keep
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {keepId && (
          <div className="mt-4 rounded-md bg-[var(--bg-overlay)] p-3 text-xs text-[var(--text-muted)]">
            <ArrowRight className="mr-1 inline h-3 w-3" />
            {getChunksForEntry(selectedIds.find((id) => id !== keepId)!).length} bullets
            will be moved to &quot;{selectedEntries.find((e: { id: string }) => e.id === keepId)?.company_name}&quot;.
            Duplicate bullets will be removed.
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            onClick={handleMerge}
            disabled={!keepId || merging}
          >
            <Merge className="mr-2 h-4 w-4" />
            {merging ? "Merging..." : "Merge"}
          </Button>
          <Button variant="ghost" onClick={() => { setStep("select"); setKeepId(null); }}>
            Back
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold">Merge Entries</h3>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Select two entries to merge. Their bullets will be combined into one entry.
      </p>

      <div className="max-h-[400px] space-y-2 overflow-y-auto">
        {entries.map((entry: { id: string; company_name: string; job_title: string; date_start: string | null; date_end: string | null; entry_type: string }) => {
          const isSelected = selectedIds.includes(entry.id);
          const entryChunks = getChunksForEntry(entry.id);

          return (
            <button
              key={entry.id}
              onClick={() => toggleSelect(entry.id)}
              className={`w-full rounded-[12px] border p-3 text-left transition-all ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-[var(--text-primary)]">
                    {entry.company_name || "Untitled"}
                  </span>
                  <span className="ml-2 text-sm text-[var(--text-muted)]">
                    {entry.job_title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-faint)]">
                    {entryChunks.length} bullets
                  </span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-[var(--accent)]" />
                  )}
                </div>
              </div>
              <div className="text-xs text-[var(--text-faint)]">
                {formatDate(entry.date_start)} — {formatDate(entry.date_end)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          onClick={() => setStep("confirm")}
          disabled={selectedIds.length !== 2}
        >
          <Merge className="mr-2 h-4 w-4" />
          Next: Choose which to keep
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
