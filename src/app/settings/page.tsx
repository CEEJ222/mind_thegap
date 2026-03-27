"use client";

import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { showSnackbar } from "@/components/ui/snackbar";
import type { OutputFormat, ResumeLength, ThemeMode } from "@/lib/types/database";

export default function SettingsPage() {
  const { settings, refreshSettings } = useAuth();
  const supabase = createClient();

  async function updateSetting(key: string, value: string | boolean) {
    if (!settings) return;
    const { error } = await supabase
      .from("user_settings")
      .update({ [key]: value })
      .eq("id", settings.id);

    if (error) {
      showSnackbar("Failed to save setting", "error");
      return;
    }

    // Apply theme change to document
    if (key === "theme") {
      document.documentElement.classList.toggle("dark", value === "dark");
    }

    await refreshSettings();
    showSnackbar("Setting updated");
  }

  if (!settings) {
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
              value={settings.output_format}
              onChange={(e) =>
                updateSetting("output_format", e.target.value as OutputFormat)
              }
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
              value={settings.include_summary ? "yes" : "no"}
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
              value={settings.resume_length}
              onChange={(e) =>
                updateSetting("resume_length", e.target.value as ResumeLength)
              }
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
              value={settings.theme}
              onChange={(e) =>
                updateSetting("theme", e.target.value as ThemeMode)
              }
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
