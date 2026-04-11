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
import {
  PortfolioLinksPreview,
  type PortfolioLinksSaveValues,
} from "@/components/profile/portfolio-links";

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
  pronouns: string;
  gender: string;
  race_ethnicity: string;
  hispanic_latinx: string;
  veteran_status: string;
  disability_status: string;
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

    await refreshSettings();
    showSnackbar("Setting updated");
  }

  const [saving, setSaving] = useState(false);

  async function saveApplicantInfo() {
    if (!localSettings) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        full_name: localSettings.full_name || null,
        preferred_name: localSettings.preferred_name || null,
        email: localSettings.email || null,
        phone: localSettings.phone || null,
        location: localSettings.location || null,
      })
      .eq("id", localSettings.id);

    if (error) {
      showSnackbar("Failed to save", "error");
    } else {
      await refreshSettings();
      showSnackbar("Applicant information saved");
    }
    setSaving(false);
  }

  async function saveDemographics() {
    if (!localSettings) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        pronouns: localSettings.pronouns || null,
        gender: localSettings.gender || null,
        race_ethnicity: localSettings.race_ethnicity || null,
        hispanic_latinx: localSettings.hispanic_latinx || null,
        veteran_status: localSettings.veteran_status || null,
        disability_status: localSettings.disability_status || null,
      })
      .eq("id", localSettings.id);

    if (error) {
      showSnackbar("Failed to save", "error");
    } else {
      await refreshSettings();
      showSnackbar("Demographic information saved");
    }
    setSaving(false);
  }

  async function savePortfolioLinks(values: PortfolioLinksSaveValues) {
    if (!localSettings) return;
    const { error } = await supabase
      .from("user_settings")
      .update({
        linkedin_url: values.linkedin.trim() || null,
        github_url: values.github.trim() || null,
        website_url: values.portfolio.trim() || null,
      })
      .eq("id", localSettings.id);

    if (error) throw error;

    setLocalSettings({
      ...localSettings,
      linkedin_url: values.linkedin,
      github_url: values.github,
      website_url: values.portfolio,
    });
    await refreshSettings();
    showSnackbar("Portfolio links saved");
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
    <div className="mx-auto max-w-6xl px-4">
      <h1 className="mb-2 text-2xl font-bold">Settings</h1>
      <p className="mb-8 text-muted-foreground">
        Configure your contact info, API keys, and resume generation preferences.
      </p>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 space-y-6">
        {/* Applicant Information */}
        <Card id="applicant-information">
          <CardHeader>
            <CardTitle className="text-lg">Applicant Information</CardTitle>
            <p className="text-xs text-[var(--text-muted)]">
              Name, email, phone, and location used on applications and your profile.
            </p>
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
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Location</label>
              <Input
                value={localSettings.location || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, location: e.target.value })}
                placeholder="Los Angeles, CA"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <Button onClick={saveApplicantInfo} disabled={saving} className="mt-2">
              {saving ? "Saving..." : "Save applicant information"}
            </Button>
          </CardContent>
        </Card>

        {/* Demographic Information */}
        <Card id="demographic-information">
          <CardHeader>
            <CardTitle className="text-lg">Demographic Information</CardTitle>
            <p className="text-xs text-[var(--text-muted)]">
              Optional. Many employers ask these for EEO reporting. You can leave fields blank.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Pronouns</label>
                <Input
                  value={localSettings.pronouns || ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, pronouns: e.target.value })}
                  placeholder="e.g. she/her, he/him, they/them"
                  className="border-[var(--border-input)] bg-[var(--bg-card)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Gender</label>
                <Select
                  value={localSettings.gender || ""}
                  onChange={(e) => setLocalSettings({ ...localSettings, gender: e.target.value })}
                >
                  <option value="">Select…</option>
                  <option value="Woman">Woman</option>
                  <option value="Man">Man</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                  <option value="Prefer to self-describe">Prefer to self-describe</option>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Hispanic or Latino
              </label>
              <Select
                value={localSettings.hispanic_latinx || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, hispanic_latinx: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Race / ethnicity
              </label>
              <Input
                value={localSettings.race_ethnicity || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, race_ethnicity: e.target.value })}
                placeholder="e.g. Asian, Black or African American, White, Multi-racial…"
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Veteran status
              </label>
              <Select
                value={localSettings.veteran_status || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, veteran_status: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="Not a veteran">Not a veteran</option>
                <option value="Protected veteran">I am a protected veteran</option>
                <option value="Active duty or recently separated">Active duty or recently separated</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                Disability status
              </label>
              <p className="mb-1.5 text-xs text-[var(--text-faint)]">
                Voluntary self-ID (including history of disability), as on many employer forms.
              </p>
              <Select
                value={localSettings.disability_status || ""}
                onChange={(e) => setLocalSettings({ ...localSettings, disability_status: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="Yes">Yes, I have a disability (or history of)</option>
                <option value="No">No</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
            </div>
            <Button onClick={saveDemographics} disabled={saving} className="mt-2">
              {saving ? "Saving..." : "Save demographic information"}
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
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-[300px] lg:sticky lg:top-6 lg:self-start">
          <PortfolioLinksPreview
            linkedin={localSettings.linkedin_url}
            github={localSettings.github_url}
            portfolio={localSettings.website_url}
            linkRows
            editable
            onSave={savePortfolioLinks}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Current Plan: <span className="text-[var(--accent)]">Free (BYOK)</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Bring your own API keys — usage billed to your accounts
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Pro Plan — $10/mo</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Platform covers all Apify and AI costs. No API keys needed.
                    </p>
                  </div>
                  <Button size="sm" disabled className="w-full opacity-60">
                    Coming soon
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Key size={16} />
                API Keys
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Your keys, your billing (free tier). Encrypted; never shown again after save.
              </p>

              <div>
                <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <label className="text-xs font-medium text-[var(--text-muted)]">
                    Apify
                    <span className="ml-1 font-normal">(LinkedIn jobs)</span>
                  </label>
                  <a
                    href="https://console.apify.com/account/integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-fit items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                  >
                    Get key <ExternalLink size={10} />
                  </a>
                </div>
                {hasApifyKey ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      value="••••••••••••••••"
                      disabled
                      className="border-[var(--border-input)] bg-[var(--bg-base)] text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKey("apify")}
                      disabled={deletingKey === "apify"}
                      className="w-full sm:w-auto"
                    >
                      {deletingKey === "apify" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <Trash2 size={14} className="mr-1.5 inline" />
                          Remove
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Input
                      type="password"
                      value={apifyKey}
                      onChange={(e) => setApifyKey(e.target.value)}
                      placeholder="apify_api_..."
                      className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => saveApiKey("apify", apifyKey)}
                      disabled={!apifyKey.trim() || savingKey === "apify"}
                      className="w-full"
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

              <div>
                <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <label className="text-xs font-medium text-[var(--text-muted)]">
                    OpenRouter
                    <span className="ml-1 font-normal">(AI)</span>
                  </label>
                  <a
                    href="https://openrouter.ai/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-fit items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                  >
                    Get key <ExternalLink size={10} />
                  </a>
                </div>
                {hasOpenrouterKey ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      value="••••••••••••••••"
                      disabled
                      className="border-[var(--border-input)] bg-[var(--bg-base)] text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKey("openrouter")}
                      disabled={deletingKey === "openrouter"}
                      className="w-full sm:w-auto"
                    >
                      {deletingKey === "openrouter" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <Trash2 size={14} className="mr-1.5 inline" />
                          Remove
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Input
                      type="password"
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      placeholder="sk-or-..."
                      className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => saveApiKey("openrouter", openrouterKey)}
                      disabled={!openrouterKey.trim() || savingKey === "openrouter"}
                      className="w-full"
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
        </aside>
      </div>
    </div>
  );
}
