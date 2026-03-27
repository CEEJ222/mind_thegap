"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { EntryType } from "@/lib/types/database";

interface Props {
  onComplete: () => void;
}

export function ManualEntry({ onComplete }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [entryType, setEntryType] = useState<EntryType>("job");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !user) return;
    setSaving(true);

    try {
      const { data: entry, error: entryError } = await supabase
        .from("profile_entries")
        .insert({
          user_id: user.id,
          entry_type: entryType,
          company_name: companyName || null,
          job_title: jobTitle || null,
          description,
          date_start: dateStart || null,
          date_end: dateEnd || null,
          source: "manual_entry",
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Split description into chunks (by line breaks or sentences)
      const chunks = description
        .split(/\n+/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      if (chunks.length > 0) {
        await supabase.from("profile_chunks").insert(
          chunks.map((chunk) => ({
            user_id: user.id,
            entry_id: entry.id,
            chunk_text: chunk,
            company_name: companyName || null,
            job_title: jobTitle || null,
            date_start: dateStart || null,
            date_end: dateEnd || null,
            entry_type: entryType,
            source: "manual_entry" as const,
          }))
        );
      }

      // Reset form
      setCompanyName("");
      setJobTitle("");
      setDateStart("");
      setDateEnd("");
      setDescription("");
      onComplete();
    } catch (err) {
      console.error("Failed to save entry:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold">Add Entry Manually</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Entry Type</label>
          <Select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as EntryType)}
          >
            <option value="job">Job</option>
            <option value="project">Project</option>
            <option value="education">Education</option>
            <option value="award">Award</option>
            <option value="certification">Certification</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              {entryType === "education" ? "Institution" : "Company / Org"}
            </label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={
                entryType === "education" ? "MIT" : "Acme Corp"
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {entryType === "education" ? "Degree / Program" : "Title / Role"}
            </label>
            <Input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={
                entryType === "education" ? "B.S. Computer Science" : "Senior PM"
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Start Date</label>
            <Input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              End Date (leave blank if current)
            </label>
            <Input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your experience, achievements, responsibilities... Use new lines to separate bullet points."
            rows={6}
            required
          />
        </div>
        <Button type="submit" disabled={!description.trim() || saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Add to Profile"
          )}
        </Button>
      </form>
    </div>
  );
}
