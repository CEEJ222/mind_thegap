"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import { formatDate } from "@/lib/utils";
import { Pencil, Check, X, Trash2, Briefcase, GraduationCap, Award, FolderOpen } from "lucide-react";

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
};

export function ProfileDisplay({ entries, chunks, onUpdate }: Props) {
  const supabase = createClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--text-muted)]">
        No profile data yet. Upload a document, add a link, or create a manual entry to get started.
      </div>
    );
  }

  const jobs = entries.filter((e) => e.entry_type === "job");
  const projects = entries.filter((e) => e.entry_type === "project");
  const education = entries.filter((e) => e.entry_type === "education");
  const awards = entries.filter(
    (e) => e.entry_type === "award" || e.entry_type === "certification"
  );

  async function handleSaveEdit(id: string) {
    const { error } = await supabase
      .from("profile_entries")
      .update({ ...editData, user_confirmed: true })
      .eq("id", id);

    if (error) {
      showSnackbar("Failed to save changes", "error");
      return;
    }

    setEditingId(null);
    setEditData({});
    showSnackbar("Profile entry updated");
    onUpdate();
  }

  async function handleDelete(id: string) {
    // Chunks cascade via FK, so just delete the entry
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function startEditing(entry: any) {
    setEditingId(entry.id);
    setEditData({
      company_name: entry.company_name,
      job_title: entry.job_title,
      description: entry.description,
    });
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
                  <div className="space-y-2">
                    <Input
                      value={editData.company_name ?? ""}
                      onChange={(e) =>
                        setEditData({ ...editData, company_name: e.target.value })
                      }
                      placeholder="Company"
                      className="border-[var(--border-input)] bg-[var(--bg-card)]"
                    />
                    <Input
                      value={editData.job_title ?? ""}
                      onChange={(e) =>
                        setEditData({ ...editData, job_title: e.target.value })
                      }
                      placeholder="Title"
                      className="border-[var(--border-input)] bg-[var(--bg-card)]"
                    />
                    <Textarea
                      value={editData.description ?? ""}
                      onChange={(e) =>
                        setEditData({ ...editData, description: e.target.value })
                      }
                      rows={3}
                      className="border-[var(--border-input)] bg-[var(--bg-card)]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(entry.id)}>
                        <Check className="mr-1 h-3 w-3" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
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
                    <p className="text-xs text-[var(--text-faint)]">
                      {formatDate(entry.date_start)} —{" "}
                      {formatDate(entry.date_end)}
                    </p>
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
                  </>
                )}
              </div>
            </div>
            {!isEditing && (
              <div className="ml-2 flex items-center gap-1">
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
    </div>
  );
}
