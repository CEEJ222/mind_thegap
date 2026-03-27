"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { showSnackbar } from "@/components/ui/snackbar";

interface Settings {
  id: string;
  output_format: string;
  include_summary: boolean;
  resume_length: string;
  theme: string;
}

export default function SettingsPage() {
  const { user, settings, refreshSettings } = useAuth();
  const supabase = createClient();
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings as Settings);
      setLoading(false);
      return;
    }
    // Fallback: load settings directly if auth context hasn't loaded them yet
    if (user) {
      supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single()
        .then(({ data }: { data: Settings | null }) => {
          if (data) setLocalSettings(data as Settings);
          setLoading(false);
        });
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
        Configure your resume generation preferences. These settings apply to
        all generated resumes.
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Output Format</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={localSettings.output_format}
              onChange={(e) => updateSetting("output_format", e.target.value)}
            >
              <option value="pdf">PDF</option>
              <option value="docx">Word Document (DOCX)</option>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Include Summary Section</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={localSettings.include_summary ? "yes" : "no"}
              onChange={(e) =>
                updateSetting("include_summary", e.target.value === "yes")
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resume Length</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={localSettings.resume_length}
              onChange={(e) => updateSetting("resume_length", e.target.value)}
            >
              <option value="1_page">Max 1 page</option>
              <option value="1_5_pages">Max 1.5 pages</option>
              <option value="2_pages">Max 2 pages</option>
              <option value="no_max">No maximum</option>
            </Select>
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
