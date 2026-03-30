"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { showSnackbar } from "@/components/ui/snackbar";
import { Key, Loader2, Trash2, ExternalLink } from "lucide-react";

interface Settings {
  id: string;
  full_name: string;
  preferred_name: string;
  linkedin_url: string;
  github_url: string;
  website_url: string;
  email: string;
  phone: string;
  location: string;
  work_authorization: string;
  requires_sponsorship: string;
  open_to_relocation: string;
  available_start_date: string;
  desired_compensation: string;
  output_format: string;
  include_summary: boolean;
  resume_length: string;
  theme: string;
  [key: string]: string | boolean;
}

interface ApiKeyInfo {
  key_type: string;
  created_at: string;
  updated_at: string;
}

export default function SettingsPage() {
  const { user, settings, refreshSettings } = useAuth();
  const supabase = createClient();
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [apifyKey, setApifyKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

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

  // Load API keys
  useEffect(() => {
    loadApiKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadApiKeys() {
    try {
      const res = await fetch("/api/user-api-keys");
      const data = await res.json();
      if (data.keys) setApiKeys(data.keys);
    } catch {
      // ignore
    }
  }

  async function saveApiKey(keyType: string, value: string) {
    if (!value.trim()) return;
    setSavingKey(keyType);

    try {
      const res = await fetch("/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_type: keyType, api_key: value.trim() }),
      });

      if (!res.ok) throw new Error("Failed to save");

      if (keyType === "apify") setApifyKey("");
      else setOpenrouterKey("");

      showSnackbar("API key saved securely");
      await loadApiKeys();
    } catch {
      showSnackbar("Failed to save API key", "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteApiKey(keyType: string) {
    setDeletingKey(keyType);
    try {
      const res = await fetch("/api/user-api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_type: keyType }),
      });

      if (!res.ok) throw new Error("Failed to remove");

      showSnackbar("API key removed");
      await loadApiKeys();
    } catch {
      showSnackbar("Failed to remove API key", "error");
    } finally {
      setDeletingKey(null);
    }
  }

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
        preferred_name: localSettings.preferred_name || null,
        linkedin_url: localSettings.linkedin_url || null,
        github_url: localSettings.github_url || null,
        website_url: localSettings.website_url || null,
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

  async function saveApplicationPrefs() {
    if (!localSettings) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        work_authorization: localSettings.work_authorization || null,
        requires_sponsorship: localSettings.requires_sponsorship || null,
        open_to_relocation: localSettings.open_to_relocation || null,
        available_start_date: localSettings.available_start_date || null,
        desired_compensation: localSettings.desired_compensation || null,
      })
      .eq("id", localSettings.id);

    if (error) {
      showSnackbar("Failed to save", "error");
    } else {
      await refreshSettings();
      showSnackbar("Application preferences saved");
    }
    setSaving(false);
  }

  const hasApifyKey = apiKeys.some((k) => k.key_type === "apify");
  const hasOpenrouterKey = apiKeys.some((k) => k.key_type === "openrouter");

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
        Configure your contact info, API keys, and resume generation preferences.
      </p>

      <div className="space-y-6">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Full Name</label>
                <Input
                  value={localSettings.full_name || ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, full_name: e.target.value })}
                  placeholder="C.J. Britz"
                  className="border-[var(--border-input)] bg-[var(--bg-card)]"
                />
                <p className="mt-1 text-xs text-[var(--text-faint)]">Auto-split into first &amp; last name on applications</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Preferred First Name</label>
                <Input
                  value={localSettings.preferred_name || ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, preferred_name: e.target.value })}
                  placeholder="C.J."
                  className="border-[var(--border-input)] bg-[var(--bg-card)]"
                />
                <p className="mt-1 text-xs text-[var(--text-faint)]">Used when a form asks for preferred name</p>
              </div>
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
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">GitHub URL</label>
              <Input
                type="url"
                value={localSettings.github_url || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, github_url: e.target.value })}
                placeholder="https://github.com/username"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Website / Portfolio</label>
              <Input
                type="url"
                value={localSettings.website_url || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, website_url: e.target.value })}
                placeholder="https://yoursite.com"
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

        {/* Application Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Application Preferences</CardTitle>
            <p className="text-xs text-[var(--text-muted)]">Pre-fill common application questions automatically.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Legally authorized to work in the US?
              </label>
              <Select
                value={localSettings.work_authorization || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, work_authorization: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Will you require sponsorship?
              </label>
              <Select
                value={localSettings.requires_sponsorship || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, requires_sponsorship: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Open to relocation?
              </label>
              <Select
                value={localSettings.open_to_relocation || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, open_to_relocation: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Available start date
              </label>
              <Input
                value={localSettings.available_start_date || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, available_start_date: e.target.value })}
                placeholder="Immediately / 2 weeks notice / March 2026"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Desired compensation
              </label>
              <Input
                value={localSettings.desired_compensation || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, desired_compensation: e.target.value })}
                placeholder="$150,000 / Negotiable"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-muted)] space-y-1">
              <p className="font-medium text-[var(--text-primary)]">Auto-answered questions</p>
              <p>• &quot;How did you hear about us?&quot; → <span className="text-[var(--text-primary)]">Other</span></p>
              <p>• Referral / &quot;who referred you?&quot; → <span className="text-[var(--text-primary)]">left blank</span></p>
            </div>
            <Button onClick={saveApplicationPrefs} disabled={saving} className="mt-2">
              {saving ? "Saving..." : "Save Preferences"}
            </Button>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key size={18} />
              API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-[var(--text-muted)]">
              Adding your own keys means your usage is billed to your accounts directly (free tier).
              Keys are encrypted and never visible after saving.
            </p>

            {/* Apify */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--text-muted)]">
                  Apify API Key
                  <span className="ml-1 text-xs font-normal">(for LinkedIn job scraping)</span>
                </label>
                <a
                  href="https://console.apify.com/account/integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  Get key <ExternalLink size={10} />
                </a>
              </div>
              {hasApifyKey ? (
                <div className="flex items-center gap-2">
                  <Input
                    value="••••••••••••••••"
                    disabled
                    className="border-[var(--border-input)] bg-[var(--bg-base)]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteApiKey("apify")}
                    disabled={deletingKey === "apify"}
                    className="flex-shrink-0"
                  >
                    {deletingKey === "apify" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={apifyKey}
                    onChange={(e) => setApifyKey(e.target.value)}
                    placeholder="apify_api_..."
                    className="border-[var(--border-input)] bg-[var(--bg-card)]"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveApiKey("apify", apifyKey)}
                    disabled={!apifyKey.trim() || savingKey === "apify"}
                    className="flex-shrink-0"
                  >
                    {savingKey === "apify" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* OpenRouter */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--text-muted)]">
                  OpenRouter API Key
                  <span className="ml-1 text-xs font-normal">(for AI analysis)</span>
                </label>
                <a
                  href="https://openrouter.ai/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  Get key <ExternalLink size={10} />
                </a>
              </div>
              {hasOpenrouterKey ? (
                <div className="flex items-center gap-2">
                  <Input
                    value="••••••••••••••••"
                    disabled
                    className="border-[var(--border-input)] bg-[var(--bg-base)]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteApiKey("openrouter")}
                    disabled={deletingKey === "openrouter"}
                    className="flex-shrink-0"
                  >
                    {deletingKey === "openrouter" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="border-[var(--border-input)] bg-[var(--bg-card)]"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveApiKey("openrouter", openrouterKey)}
                    disabled={!openrouterKey.trim() || savingKey === "openrouter"}
                    className="flex-shrink-0"
                  >
                    {savingKey === "openrouter" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Current Plan: <span className="text-[var(--accent)]">Free (BYOK)</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Bring your own API keys — usage billed to your accounts
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Pro Plan — $10/mo</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Platform covers all Apify and AI costs. No API keys needed.
                  </p>
                </div>
                <Button size="sm" disabled className="w-full opacity-60 sm:w-auto">
                  Coming soon
                </Button>
              </div>
            </div>
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
