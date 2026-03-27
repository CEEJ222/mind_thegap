"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Props {
  onComplete: () => void;
}

export function AddLink({ onComplete }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [url, setUrl] = useState("");
  const [urlType, setUrlType] = useState("personal_website");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !user) return;
    setSaving(true);

    try {
      const { error } = await supabase.from("scraped_urls").insert({
        user_id: user.id,
        url: url.trim(),
        url_type: urlType,
        processing_status: "pending",
      });

      if (error) throw error;

      // Trigger scraping
      await fetch("/api/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, url: url.trim(), url_type: urlType }),
      });

      setUrl("");
      onComplete();
    } catch (err) {
      console.error("Failed to add link:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold">Add Link</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Add URLs to your personal website, portfolio, or project pages. GitHub
        links are not supported in v1 — use document upload instead. For
        LinkedIn, export your profile as PDF and upload it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">URL Type</label>
          <Select
            value={urlType}
            onChange={(e) => setUrlType(e.target.value)}
          >
            <option value="personal_website">Personal Website</option>
            <option value="portfolio">Portfolio</option>
            <option value="project">Project URL</option>
            <option value="employer">Employer Website</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">URL</label>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
          />
        </div>
        <Button type="submit" disabled={!url.trim() || saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Add Link"
          )}
        </Button>
      </form>
    </div>
  );
}
