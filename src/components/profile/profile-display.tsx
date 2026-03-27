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
import { Pencil, Check, X, Briefcase, GraduationCap, Award, FolderOpen } from "lucide-react";
import type { Database } from "@/lib/types/database";

type ProfileEntry = Database["public"]["Tables"]["profile_entries"]["Row"];

interface Props {
  entries: ProfileEntry[];
  onUpdate: () => void;
}

const typeIcons = {
  job: Briefcase,
  project: FolderOpen,
  education: GraduationCap,
  award: Award,
  certification: Award,
};

export function ProfileDisplay({ entries, onUpdate }: Props) {
  const supabase = createClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ProfileEntry>>({});

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No profile data yet. Upload a document, add a link, or create a manual entry to get started.
      </div>
    );
  }

  // Group entries by type
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

  function startEditing(entry: ProfileEntry) {
    setEditingId(entry.id);
    setEditData({
      company_name: entry.company_name,
      job_title: entry.job_title,
      description: entry.description,
    });
  }

  function renderEntry(entry: ProfileEntry) {
    const Icon = typeIcons[entry.entry_type] || Briefcase;
    const isEditing = editingId === entry.id;

    return (
      <Card key={entry.id} className="mb-3">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Icon className="mt-1 h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editData.company_name ?? ""}
                      onChange={(e) =>
                        setEditData({ ...editData, company_name: e.target.value })
                      }
                      placeholder="Company"
                    />
                    <Input
                      value={editData.job_title ?? ""}
                      onChange={(e) =>
                        setEditData({ ...editData, job_title: e.target.value })
                      }
                      placeholder="Title"
                    />
                    <Textarea
                      value={editData.description ?? ""}
                      onChange={(e) =>
                        setEditData({ ...editData, description: e.target.value })
                      }
                      rows={3}
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
                      <h4 className="font-semibold">
                        {entry.company_name || "Untitled"}
                      </h4>
                      {entry.user_confirmed && (
                        <Badge variant="outline" className="text-xs">
                          Confirmed
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs capitalize">
                        {entry.source.replace("_", " ")}
                      </Badge>
                    </div>
                    {entry.job_title && (
                      <p className="text-sm text-muted-foreground">
                        {entry.job_title}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.date_start)} —{" "}
                      {formatDate(entry.date_end)}
                    </p>
                    {entry.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {entry.description}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={() => startEditing(entry)}
                className="ml-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderSection(title: string, items: ProfileEntry[]) {
    if (items.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
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
