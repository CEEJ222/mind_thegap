"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { showSnackbar } from "@/components/ui/snackbar";
import { UploadDocuments } from "@/components/profile/upload-documents";
import { AddLink } from "@/components/profile/add-link";
import { ManualEntry } from "@/components/profile/manual-entry";
import { PasteAndParse } from "@/components/profile/paste-and-parse";
import { MergeEntries } from "@/components/profile/merge-entries";
import { ProfileDisplay } from "@/components/profile/profile-display";
import { DocumentsList } from "@/components/profile/documents-list";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import {
  Upload,
  Link as LinkIcon,
  PenLine,
  ClipboardPaste,
  RefreshCw,
  CheckCircle2,
  FileText,
  Globe,
  Pen,
  Plus,
} from "lucide-react";

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chunks, setChunks] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [documents, setDocuments] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [urls, setUrls] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<
    "upload" | "link" | "manual" | "paste" | "merge" | null
  >(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  async function regenerateSummary() {
    if (!user) return;
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.summary) setSummary(data.summary);
    } catch {
      // Silently fail
    } finally {
      setSummaryLoading(false);
    }
  }

  const loadData = useCallback(async () => {
    if (!user) {
      console.log("loadData: no user");
      return;
    }
    console.log("loadData: fetching for", user.id);

    // Run queries individually so one failure doesn't block all
    const entriesRes = await supabase.from("profile_entries").select("*").eq("user_id", user.id).order("date_start", { ascending: false }).catch(() => null);
    const chunksRes = await supabase.from("profile_chunks").select("*").eq("user_id", user.id).catch(() => null);
    const docsRes = await supabase.from("uploaded_documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).catch(() => null);
    const urlsRes = await supabase.from("scraped_urls").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).catch(() => null);
    const userRes = await supabase.from("users").select("profile_summary, avatar_url").eq("id", user.id).limit(1).catch(() => null);

    console.log("loadData results:", {
      entries: entriesRes?.data?.length ?? "ERR",
      chunks: chunksRes?.data?.length ?? "ERR",
      docs: docsRes?.data?.length ?? "ERR",
      urls: urlsRes?.data?.length ?? "ERR",
      user: userRes?.data?.[0] ? "OK" : "ERR",
      entriesError: entriesRes?.error?.message,
    });

    if (entriesRes?.data) setEntries(entriesRes.data);
    if (chunksRes?.data) setChunks(chunksRes.data);
    if (docsRes?.data) setDocuments(docsRes.data);
    if (urlsRes?.data) setUrls(urlsRes.data);
    const userData = userRes?.data?.[0];
    if (userData?.profile_summary) setSummary(userData.profile_summary as string);
    if (userData?.avatar_url) setAvatarUrl(userData.avatar_url as string);
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase, refreshProfile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasDocuments = documents.length > 0;
  const hasLinks = urls.length > 0;
  const hasManualEntries = entries.some((e: { source: string }) => e.source === "manual_entry");
  const isNewUser = entries.length === 0 && documents.length === 0 && urls.length === 0;

  function openSection(section: "upload" | "link" | "manual" | "paste") {
    setActiveSection(section);
    setAddMenuOpen(false);
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Profile header with avatar */}
      <div className="mb-6 flex items-center gap-5">
        <AvatarUpload
          fullName={user?.user_metadata?.full_name || user?.email || "User"}
          avatarUrl={avatarUrl}
          onUpdate={loadData}
        />
        <div>
          <h1 className="text-2xl font-bold">{user?.user_metadata?.full_name || "Profile"}</h1>
          <p className="text-muted-foreground">
            {isNewUser
              ? "Get started by adding your experience."
              : "Manage your career profile data."}
          </p>
        </div>
      </div>

      {/* AI-generated summary */}
      {!isNewUser && (
        <div className="mb-8 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              AI Summary
            </h3>
            <button
              onClick={regenerateSummary}
              disabled={summaryLoading}
              className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:text-[var(--accent-dark)] disabled:opacity-50"
            >
              <RefreshCw size={12} className={summaryLoading ? "animate-spin" : ""} />
              {summaryLoading ? "Generating..." : "Regenerate"}
            </button>
          </div>
          {summary ? (
            <p className="text-sm leading-relaxed text-[var(--text-primary)]">{summary}</p>
          ) : (
            <p className="text-sm italic text-[var(--text-faint)]">
              {summaryLoading ? "Generating summary..." : "No summary yet. Click \"Regenerate\" to create one."}
            </p>
          )}
        </div>
      )}

      {/* Onboarding for new users */}
      {isNewUser && !activeSection && (
        <div className="mb-10 grid gap-4 md:grid-cols-4">
          {[
            { key: "upload" as const, icon: FileText, title: "Upload a Document", description: "Resume, project write-up, performance review, or certification", done: hasDocuments },
            { key: "link" as const, icon: Globe, title: "Add a Link", description: "Personal website, portfolio, or project URL", done: hasLinks },
            { key: "manual" as const, icon: Pen, title: "Add Manually", description: "Type in a job, project, education, or award directly", done: hasManualEntries },
            { key: "paste" as const, icon: ClipboardPaste, title: "Paste & Parse", description: "Paste any document and AI will extract the structured data", done: false },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className="group relative flex flex-col items-center rounded-lg border-2 border-dashed border-border bg-card p-8 text-center transition-all hover:border-accent hover:shadow-md"
            >
              {item.done && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-accent" />}
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 transition-colors group-hover:bg-accent/20">
                <item.icon className="h-7 w-7 text-accent" />
              </div>
              <h3 className="mb-1 font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* Active input section (full width, above the two-column layout) */}
      {activeSection && activeSection !== "merge" && (
        <Card className="mb-8">
          <CardContent className="pt-6">
            {activeSection === "upload" && (
              <UploadDocuments onComplete={() => { loadData(); setActiveSection(null); showSnackbar("Document uploaded — processing in background"); }} />
            )}
            {activeSection === "link" && (
              <AddLink onComplete={() => { loadData(); setActiveSection(null); showSnackbar("URL added — scraping in background"); }} />
            )}
            {activeSection === "manual" && (
              <ManualEntry onComplete={() => { loadData(); setActiveSection(null); showSnackbar("Entry added to profile"); }} />
            )}
            {activeSection === "paste" && (
              <PasteAndParse onComplete={() => { loadData(); setActiveSection(null); }} />
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setActiveSection(null)}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column layout */}
      {!isNewUser && (
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
          {/* Left column — Profile entries */}
          <div className="flex-1 min-w-0">
            {activeSection === "merge" && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <MergeEntries
                    entries={entries}
                    chunks={chunks}
                    onComplete={() => { loadData(); setActiveSection(null); }}
                    onCancel={() => setActiveSection(null)}
                  />
                </CardContent>
              </Card>
            )}

            <ProfileDisplay
              entries={entries}
              chunks={chunks}
              onUpdate={loadData}
              onMerge={entries.length >= 2 ? () => setActiveSection(activeSection === "merge" ? null : "merge") : undefined}
              mergeActive={activeSection === "merge"}
            />
          </div>

          {/* Right column — Files & Links (top on mobile, right on desktop) */}
          <div className="w-full md:w-[300px] md:flex-shrink-0 overflow-hidden">
            <div className="md:sticky md:top-6 md:max-h-[calc(100vh-120px)] md:overflow-y-auto">
              {/* Documents & URLs list with + button */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Uploaded Files & Links</h2>
                  <div className="relative">
                    <button
                      onClick={() => setAddMenuOpen(!addMenuOpen)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] transition-colors shadow-sm"
                    >
                      <Plus size={16} />
                    </button>
                    {addMenuOpen && (
                      <div className="absolute top-full right-0 z-10 mt-2 w-52 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] py-1 shadow-lg">
                        <button
                          onClick={() => openSection("upload")}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]"
                        >
                          <Upload size={14} className="text-[var(--text-muted)]" />
                          Upload Document
                        </button>
                        <button
                          onClick={() => openSection("link")}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]"
                        >
                          <LinkIcon size={14} className="text-[var(--text-muted)]" />
                          Add Link
                        </button>
                        <button
                          onClick={() => openSection("paste")}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]"
                        >
                          <ClipboardPaste size={14} className="text-[var(--text-muted)]" />
                          Paste & Parse
                        </button>
                        <button
                          onClick={() => openSection("manual")}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]"
                        >
                          <PenLine size={14} className="text-[var(--text-muted)]" />
                          Add Entry Manually
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <DocumentsList documents={documents} urls={urls} onUpdate={loadData} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
