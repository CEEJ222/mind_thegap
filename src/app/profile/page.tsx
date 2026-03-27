"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Circle,
} from "lucide-react";
import type { Database } from "@/lib/types/database";

type ProfileEntry = Database["public"]["Tables"]["profile_entries"]["Row"];
type UploadedDoc = Database["public"]["Tables"]["uploaded_documents"]["Row"];
type ScrapedUrl = Database["public"]["Tables"]["scraped_urls"]["Row"];

export default function ProfilePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [entries, setEntries] = useState<ProfileEntry[]>([]);
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [urls, setUrls] = useState<ScrapedUrl[]>([]);
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
  }, [user, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasDocuments = documents.length > 0;
  const hasLinks = urls.length > 0;
  const hasManualEntries = entries.some((e) => e.source === "manual_entry");
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

      {/* Onboarding checklist for new users */}
      {isNewUser && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                done: hasDocuments,
                label: "Upload a resume or document",
                action: () => setActiveSection("upload"),
              },
              {
                done: hasLinks,
                label: "Add a link",
                action: () => setActiveSection("link"),
              },
              {
                done: hasManualEntries,
                label: "Add a manual entry",
                action: () => setActiveSection("manual"),
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="flex w-full items-center gap-3 rounded-md p-3 text-left hover:bg-muted"
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                <span className={item.done ? "text-muted-foreground line-through" : ""}>
                  {item.label}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
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
