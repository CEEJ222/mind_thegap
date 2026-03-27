"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { showSnackbar } from "@/components/ui/snackbar";
import { UploadDocuments } from "@/components/profile/upload-documents";
import { AddLink } from "@/components/profile/add-link";
import { ManualEntry } from "@/components/profile/manual-entry";
import { ProfileDisplay } from "@/components/profile/profile-display";
import {
  Upload,
  Link as LinkIcon,
  PenLine,
  CheckCircle2,
  FileText,
  Globe,
  Pen,
} from "lucide-react";

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [documents, setDocuments] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [urls, setUrls] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<
    "upload" | "link" | "manual" | null
  >(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [entriesRes, docsRes, urlsRes] = await Promise.all([
      supabase
        .from("profile_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("date_start", { ascending: false }),
      supabase
        .from("uploaded_documents")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("scraped_urls")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (entriesRes.data) setEntries(entriesRes.data);
    if (docsRes.data) setDocuments(docsRes.data);
    if (urlsRes.data) setUrls(urlsRes.data);
    setLoading(false);
    refreshProfile();
  }, [user, supabase, refreshProfile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasDocuments = documents.length > 0;
  const hasLinks = urls.length > 0;
  const hasManualEntries = entries.some((e: { source: string }) => e.source === "manual_entry");
  const isNewUser = entries.length === 0 && documents.length === 0 && urls.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">Profile</h1>
      <p className="mb-8 text-muted-foreground">
        {isNewUser
          ? "Get started by adding your experience. Complete at least one item to unlock resume generation."
          : "Manage your career profile data. Everything you add here is used to generate tailored resumes."}
      </p>

      {/* Onboarding for new users — card grid */}
      {isNewUser && !activeSection && (
        <div className="mb-10 grid gap-4 md:grid-cols-3">
          {[
            {
              key: "upload" as const,
              icon: FileText,
              title: "Upload a Document",
              description: "Resume, project write-up, performance review, or certification",
              done: hasDocuments,
            },
            {
              key: "link" as const,
              icon: Globe,
              title: "Add a Link",
              description: "Personal website, portfolio, or project URL",
              done: hasLinks,
            },
            {
              key: "manual" as const,
              icon: Pen,
              title: "Add Manually",
              description: "Type in a job, project, education, or award directly",
              done: hasManualEntries,
            },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className="group relative flex flex-col items-center rounded-lg border-2 border-dashed border-border bg-card p-8 text-center transition-all hover:border-accent hover:shadow-md"
            >
              {item.done && (
                <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-accent" />
              )}
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 transition-colors group-hover:bg-accent/20">
                <item.icon className="h-7 w-7 text-accent" />
              </div>
              <h3 className="mb-1 font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Action buttons for returning users */}
      {!isNewUser && (
        <div className="mb-8 flex flex-wrap gap-3">
          <Button
            variant={activeSection === "upload" ? "default" : "outline"}
            onClick={() =>
              setActiveSection(activeSection === "upload" ? null : "upload")
            }
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
          <Button
            variant={activeSection === "link" ? "default" : "outline"}
            onClick={() =>
              setActiveSection(activeSection === "link" ? null : "link")
            }
          >
            <LinkIcon className="mr-2 h-4 w-4" />
            Add Link
          </Button>
          <Button
            variant={activeSection === "manual" ? "default" : "outline"}
            onClick={() =>
              setActiveSection(activeSection === "manual" ? null : "manual")
            }
          >
            <PenLine className="mr-2 h-4 w-4" />
            Add Entry
          </Button>
        </div>
      )}

      {/* Active input section */}
      {activeSection === "upload" && (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <UploadDocuments
              onComplete={() => {
                loadData();
                setActiveSection(null);
                showSnackbar("Document uploaded — processing in background");
              }}
            />
          </CardContent>
        </Card>
      )}
      {activeSection === "link" && (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <AddLink
              onComplete={() => {
                loadData();
                setActiveSection(null);
                showSnackbar("URL added — scraping in background");
              }}
            />
          </CardContent>
        </Card>
      )}
      {activeSection === "manual" && (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <ManualEntry
              onComplete={() => {
                loadData();
                setActiveSection(null);
                showSnackbar("Entry added to profile");
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Profile display */}
      <ProfileDisplay entries={entries} onUpdate={loadData} />
    </div>
  );
}
