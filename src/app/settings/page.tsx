"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { showSnackbar } from "@/components/ui/snackbar";

interface Settings {
  id: string;
  full_name: string;
  linkedin_url: string;
  email: string;
  phone: string;
  location: string;
  output_format: string;
  include_summary: boolean;
  resume_length: string;
  theme: string;
  [key: string]: string | boolean;
}

export default function SettingsPage() {
  const { user, settings, refreshSettings } = useAuth();
  const supabase = createClient();
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings as unknown as Settings);
      setLoading(false);
      return;
    }
    if (user) {
      (async () => {
        try {
          const { data } = await supabase
            .from("user_settings")
            .select("*")
            .eq("user_id", user.id)
            .limit(1);
          if (data?.[0]) setLocalSettings(data[0] as Settings);
        } catch {
          // ignore
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [user, settings, supabase]);

  async function updateSetting(key: string, value: string | boolean) {
    if (!localSettings) return;
    const { error } = await supabase
      .from("user_settings")
      .update({ [key]: value })
      .eq("id", localSettings.id);

    if (error) {
      showSnackbar("Failed to save setting", "error");
      return;
    }

    setLocalSettings({ ...localSettings, [key]: value });

    if (key === "theme") {
      document.documentElement.classList.toggle("dark", value === "dark");
    }

    await refreshSettings();
    showSnackbar("Setting updated");
  }

  const [saving, setSaving] = useState(false);

  async function saveContactInfo() {
    if (!localSettings) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        full_name: localSettings.full_name || null,
        linkedin_url: localSettings.linkedin_url || null,
        email: localSettings.email || null,
        phone: localSettings.phone || null,
        location: localSettings.location || null,
      })
      .eq("id", localSettings.id);

    if (error) {
      showSnackbar("Failed to save", "error");
    } else {
      await refreshSettings();
      showSnackbar("Contact info saved");
    }
    setSaving(false);
  }

  if (loading || !localSettings) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Settings</h1>
      <p className="mb-8 text-muted-foreground">
        Configure your contact info and resume generation preferences.
      </p>

      <div className="space-y-6">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Full Name</label>
              <Input
                value={localSettings.full_name || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, full_name: e.target.value })}

                placeholder="C.J. Britz"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Email</label>
              <Input
                type="email"
                value={localSettings.email || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, email: e.target.value })}

                placeholder="you@example.com"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Phone</label>
              <Input
                type="tel"
                value={localSettings.phone || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, phone: e.target.value })}

                placeholder="805-428-7721"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">LinkedIn URL</label>
              <Input
                type="url"
                value={localSettings.linkedin_url || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, linkedin_url: e.target.value })}

                placeholder="https://linkedin.com/in/cjbritz"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Location</label>
              <Input
                value={localSettings.location || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, location: e.target.value })}

                placeholder="Los Angeles, CA"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <Button onClick={saveContactInfo} disabled={saving} className="mt-2">
              {saving ? "Saving..." : "Save Contact Info"}
            </Button>
          </CardContent>
        </Card>

        {/* Resume Output */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resume Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Output Format</label>
              <Select
                value={localSettings.output_format}
                onChange={(e) => updateSetting("output_format", e.target.value)}
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word Document (DOCX)</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Include Summary Section</label>
              <Select
                value={localSettings.include_summary ? "yes" : "no"}
                onChange={(e) =>
                  updateSetting("include_summary", e.target.value === "yes")
                }
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Resume Length</label>
              <Select
                value={localSettings.resume_length}
                onChange={(e) => updateSetting("resume_length", e.target.value)}
              >
                <option value="1_page">Max 1 page</option>
                <option value="1_5_pages">Max 1.5 pages</option>
                <option value="2_pages">Max 2 pages</option>
                <option value="no_max">No maximum</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Theme</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={localSettings.theme}
              onChange={(e) => updateSetting("theme", e.target.value)}
            >
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
            </Select>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
