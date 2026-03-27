"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import { formatDate } from "@/lib/utils";
import { Pencil, Check, X, Trash2, Plus, Link as LinkIcon, Loader2, Briefcase, GraduationCap, Award, FolderOpen, Wrench } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chunks: any[];
  onUpdate: () => void;
}

const typeIcons: Record<string, typeof Briefcase> = {
  job: Briefcase,
  project: FolderOpen,
  education: GraduationCap,
  award: Award,
  certification: Award,
  skills: Wrench,
};

export function ProfileDisplay({ entries, chunks, onUpdate }: Props) {
  const supabase = createClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [editChunks, setEditChunks] = useState<{ id: string; text: string }[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--text-muted)]">
        No profile data yet. Upload a document, add a link, or create a manual entry to get started.
      </div>
    );
  }

  const jobs = entries.filter((e: { entry_type: string }) => e.entry_type === "job");
  const projects = entries.filter((e: { entry_type: string }) => e.entry_type === "project");
  const education = entries.filter((e: { entry_type: string }) => e.entry_type === "education");
  const awards = entries.filter(
    (e: { entry_type: string }) => e.entry_type === "award" || e.entry_type === "certification"
  );
  const skills = entries.filter((e: { entry_type: string }) => e.entry_type === "skills");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function startEditing(entry: any) {
    const entryChunks = chunks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) => c.entry_id === entry.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => ({ id: c.id, text: c.chunk_text }));

    setEditingId(entry.id);
    setEditData({
      company_name: entry.company_name ?? "",
      job_title: entry.job_title ?? "",
      date_start: entry.date_start ?? "",
      date_end: entry.date_end ?? "",
    });
    setEditChunks(entryChunks);
  }

  async function handleSaveEdit(entryId: string) {
    // Update the entry fields
    const { error } = await supabase
      .from("profile_entries")
      .update({
        company_name: editData.company_name || null,
        job_title: editData.job_title || null,
        date_start: editData.date_start || null,
        date_end: editData.date_end || null,
        user_confirmed: true,
      })
      .eq("id", entryId);

    if (error) {
      showSnackbar("Failed to save changes", "error");
      return;
    }

    // Update each chunk
    for (const chunk of editChunks) {
      if (chunk.id.startsWith("new-")) {
        // New chunk — insert
        if (chunk.text.trim()) {
          await supabase.from("profile_chunks").insert({
            user_id: entries.find((e: { id: string }) => e.id === entryId)?.user_id,
            entry_id: entryId,
            chunk_text: chunk.text.trim(),
            source: "manual_entry",
          });
        }
      } else {
        // Existing chunk — update
        if (chunk.text.trim()) {
          await supabase
            .from("profile_chunks")
            .update({ chunk_text: chunk.text.trim(), user_confirmed: true })
            .eq("id", chunk.id);
        } else {
          // Empty text — delete the chunk
          await supabase.from("profile_chunks").delete().eq("id", chunk.id);
        }
      }
    }

    setEditingId(null);
    setEditData({});
    setEditChunks([]);
    showSnackbar("Entry updated");
    onUpdate();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase
      .from("profile_entries")
      .delete()
      .eq("id", id);

    if (error) {
      showSnackbar("Failed to delete entry", "error");
      return;
    }

    setDeletingId(null);
    showSnackbar("Entry deleted");
    onUpdate();
  }

  async function handleAddLink(entryId: string) {
    if (!linkUrl.trim()) return;
    setLinkLoading(true);

    try {
      const res = await fetch("/api/enrich-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_id: entryId,
          url: linkUrl.trim(),
        }),
      });

      if (!res.ok) throw new Error("Enrichment failed");

      setLinkingId(null);
      setLinkUrl("");
      showSnackbar("URL scraped — entry enriched");
      onUpdate();
    } catch (err) {
      console.error("Link failed:", err);
      showSnackbar("Failed to enrich entry", "error");
    } finally {
      setLinkLoading(false);
    }
  }

  function updateChunkText(index: number, text: string) {
    setEditChunks((prev) =>
      prev.map((c, i) => (i === index ? { ...c, text } : c))
    );
  }

  function removeChunk(index: number) {
    setEditChunks((prev) => prev.filter((_, i) => i !== index));
  }

  function addChunk() {
    setEditChunks((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, text: "" },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderEntry(entry: any) {
    const Icon = typeIcons[entry.entry_type] || Briefcase;
    const isEditing = editingId === entry.id;
    const isConfirmingDelete = deletingId === entry.id;

    return (
      <Card key={entry.id} className="mb-3 border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Icon className="mt-1 h-5 w-5 text-[var(--text-muted)]" />
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Company & Title */}
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={editData.company_name}
                        onChange={(e) =>
                          setEditData({ ...editData, company_name: e.target.value })
                        }
                        placeholder="Company"
                        className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                      />
                      <Input
                        value={editData.job_title}
                        onChange={(e) =>
                          setEditData({ ...editData, job_title: e.target.value })
                        }
                        placeholder="Title"
                        className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                      />
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Start Date</label>
                        <Input
                          type="date"
                          value={editData.date_start}
                          onChange={(e) =>
                            setEditData({ ...editData, date_start: e.target.value })
                          }
                          className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[var(--text-muted)]">End Date (blank = present)</label>
                        <Input
                          type="date"
                          value={editData.date_end}
                          onChange={(e) =>
                            setEditData({ ...editData, date_end: e.target.value })
                          }
                          className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                        />
                      </div>
                    </div>

                    {/* Bullets */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">
                        Bullet Points
                      </label>
                      <div className="space-y-1.5">
                        {editChunks.map((chunk, i) => (
                          <div key={chunk.id} className="flex items-start gap-1.5">
                            <span className="mt-2.5 text-[var(--text-faint)]">•</span>
                            <Input
                              value={chunk.text}
                              onChange={(e) => updateChunkText(i, e.target.value)}
                              placeholder="Achievement or responsibility..."
                              className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                            />
                            <button
                              onClick={() => removeChunk(i)}
                              className="mt-2 text-[var(--text-faint)] hover:text-[var(--red-muted)]"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={addChunk}
                        className="mt-2 flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-dark)]"
                      >
                        <Plus size={12} /> Add bullet
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => handleSaveEdit(entry.id)}>
                        <Check className="mr-1 h-3 w-3" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditData({});
                          setEditChunks([]);
                        }}
                      >
                        <X className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-[var(--text-primary)]">
                        {entry.company_name || "Untitled"}
                      </h4>
                      {entry.user_confirmed && (
                        <Badge variant="outline" className="text-xs">
                          Confirmed
                        </Badge>
                      )}
                    </div>
                    {entry.job_title && (
                      <p className="text-sm text-[var(--text-muted)]">
                        {entry.job_title}
                      </p>
                    )}
                    {(entry.date_start || entry.date_end) && (
                      <p className="text-xs text-[var(--text-faint)]">
                        {formatDate(entry.date_start)} —{" "}
                        {formatDate(entry.date_end)}
                      </p>
                    )}
                    {/* Bullet points from chunks */}
                    {(() => {
                      const entryChunks = chunks.filter(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (c: any) => c.entry_id === entry.id
                      );
                      if (entryChunks.length > 0) {
                        return (
                          <ul className="mt-2 space-y-1">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {entryChunks.map((chunk: any) => (
                              <li
                                key={chunk.id}
                                className="flex items-start gap-2 text-sm text-[var(--text-primary)]"
                              >
                                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-[var(--text-muted)]" />
                                <span>{chunk.chunk_text}</span>
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      if (entry.description) {
                        return (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                            {entry.description}
                          </p>
                        );
                      }
                      return null;
                    })()}
                    {/* Inline URL input */}
                    {linkingId === entry.id && (
                      <div className="mt-3 flex items-center gap-2 rounded-md bg-[var(--bg-overlay)] p-2">
                        <Input
                          type="url"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="https://www.example.com"
                          className="h-8 border-[var(--border-input)] bg-[var(--bg-card)] text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddLink(entry.id);
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleAddLink(entry.id)}
                          disabled={!linkUrl.trim() || linkLoading}
                          className="h-8 px-3 text-xs"
                        >
                          {linkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Scrape"}
                        </Button>
                        <button
                          onClick={() => { setLinkingId(null); setLinkUrl(""); }}
                          className="text-[var(--text-faint)] hover:text-[var(--text-primary)]"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {!isEditing && (
              <div className="ml-2 flex items-center gap-1">
                <button
                  onClick={() => {
                    setLinkingId(linkingId === entry.id ? null : entry.id);
                    setLinkUrl("");
                  }}
                  className="rounded-md p-1.5 text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--accent)]"
                  title="Add URL"
                >
                  <LinkIcon size={14} />
                </button>
                <button
                  onClick={() => startEditing(entry)}
                  className="rounded-md p-1.5 text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
                >
                  <Pencil size={14} />
                </button>
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(entry.id)}
                      className="h-7 px-2 text-xs"
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingId(null)}
                      className="h-7 px-2 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(entry.id)}
                    className="rounded-md p-1.5 text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--red-muted)]"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderSection(title: string, items: any[]) {
    if (items.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        {items.map(renderEntry)}
      </div>
    );
  }

  return (
    <div>
      {renderSection("Work Experience", jobs)}
      {renderSection("Projects", projects)}
      {renderSection("Education", education)}
      {renderSection("Awards & Certifications", awards)}
      {renderSection("Skills & Expertise", skills)}
    </div>
  );
}
