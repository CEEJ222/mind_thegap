"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { showSnackbar } from "@/components/ui/snackbar";
import {
  Search,
  Loader2,
  Bookmark,
  BookmarkCheck,
  X,
  ExternalLink,
  Sparkles,
  Plus,
  MapPin,
  Building2,
  Clock,
  Users,
  DollarSign,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@/lib/types/database";

interface Job {
  id: string;
  title: string | null;
  company_name: string | null;
  company_logo: string | null;
  location: string | null;
  salary_info: Record<string, unknown> | null;
  posted_at: string | null;
  employment_type: string | null;
  seniority_level: string | null;
  apply_url: string | null;
  applicants_count: number | null;
  description_text: string | null;
}

interface UserJob {
  id: string;
  job_id: string;
  status: JobStatus;
  fit_score: number | null;
}

interface SavedSearch {
  id: string;
  name: string;
  search_url: string;
  is_active: boolean;
  created_at: string;
}

export default function JobsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [userJobs, setUserJobs] = useState<Map<string, UserJob>>(new Map());
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  // New search form
  const [showNewSearch, setShowNewSearch] = useState(false);
  const [newSearchUrl, setNewSearchUrl] = useState("");
  const [newSearchName, setNewSearchName] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);

  const loadSavedSearches = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_saved_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSavedSearches(data || []);
    setLoading(false);
  }, [user, supabase]);

  const loadUserJobs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_jobs")
      .select("id, job_id, status, fit_score")
      .eq("user_id", user.id);
    const map = new Map<string, UserJob>();
    (data || []).forEach((uj: { id: string; job_id: string; status: JobStatus; fit_score: number | null }) => map.set(uj.job_id, uj as UserJob));
    setUserJobs(map);
  }, [user, supabase]);

  useEffect(() => {
    loadSavedSearches();
    loadUserJobs();
  }, [loadSavedSearches, loadUserJobs]);

  async function handleSaveSearch() {
    if (!user || !newSearchUrl.trim() || !newSearchName.trim()) return;
    setSavingSearch(true);

    try {
      // Hash URL client-side for the search_url_hash
      const encoder = new TextEncoder();
      const data = encoder.encode(newSearchUrl.trim().toLowerCase().replace(/\/+$/, ""));
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const { error } = await supabase.from("user_saved_searches").insert({
        user_id: user.id,
        name: newSearchName.trim(),
        search_url: newSearchUrl.trim(),
        search_url_hash: hashHex,
      });

      if (error) throw error;

      setNewSearchUrl("");
      setNewSearchName("");
      setShowNewSearch(false);
      showSnackbar("Search saved");
      await loadSavedSearches();
    } catch {
      showSnackbar("Failed to save search", "error");
    } finally {
      setSavingSearch(false);
    }
  }

  async function handleRunSearch(search: SavedSearch) {
    setScraping(true);
    setActiveSearchId(search.id);
    setJobs([]);

    try {
      const res = await fetch("/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_url: search.search_url }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setJobs(data.jobs || []);

      // Create user_jobs entries for new jobs
      if (user && data.job_ids?.length) {
        for (const jobId of data.job_ids) {
          if (!userJobs.has(jobId)) {
            await supabase.from("user_jobs").upsert(
              { user_id: user.id, job_id: jobId, search_id: search.id, status: "unseen" as JobStatus },
              { onConflict: "user_id,job_id" }
            );
          }
        }
        await loadUserJobs();
      }

      if (data.cached) {
        showSnackbar("Loaded from cache");
      } else {
        showSnackbar(`Found ${data.jobs?.length || 0} jobs`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      showSnackbar(msg, "error");
    } finally {
      setScraping(false);
    }
  }

  async function handleDeleteSearch(searchId: string) {
    const { error } = await supabase
      .from("user_saved_searches")
      .delete()
      .eq("id", searchId);

    if (error) {
      showSnackbar("Failed to delete", "error");
      return;
    }

    if (activeSearchId === searchId) {
      setActiveSearchId(null);
      setJobs([]);
    }
    showSnackbar("Search removed");
    await loadSavedSearches();
  }

  async function updateJobStatus(jobId: string, status: JobStatus) {
    if (!user) return;

    await supabase.from("user_jobs").upsert(
      { user_id: user.id, job_id: jobId, status },
      { onConflict: "user_id,job_id" }
    );

    await loadUserJobs();
  }

  function handleAnalyze(job: Job) {
    // Navigate to generate page with job description pre-filled
    const params = new URLSearchParams();
    if (job.description_text) params.set("jd", job.description_text);
    if (job.company_name) params.set("company", job.company_name);
    if (job.title) params.set("title", job.title);
    router.push(`/generate?${params.toString()}`);
  }

  function formatPostedDate(posted: string | null): string {
    if (!posted) return "";
    const date = new Date(posted);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return date.toLocaleDateString();
  }

  function formatSalary(info: Record<string, unknown> | null): string | null {
    if (!info) return null;
    if (typeof info === "string") return info;
    const min = info.min || info.minimum || info.from;
    const max = info.max || info.maximum || info.to;
    const currency = (info.currency as string) || "$";
    if (min && max) return `${currency}${Number(min).toLocaleString()} - ${currency}${Number(max).toLocaleString()}`;
    if (min) return `From ${currency}${Number(min).toLocaleString()}`;
    if (max) return `Up to ${currency}${Number(max).toLocaleString()}`;
    return null;
  }

  // Filter out dismissed jobs
  const visibleJobs = jobs.filter((j) => {
    const uj = userJobs.get(j.id);
    return !uj || uj.status !== "dismissed";
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Jobs</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Search LinkedIn jobs and analyze them against your profile
          </p>
        </div>
        <Button
          onClick={() => setShowNewSearch(true)}
          size="sm"
          variant="outline"
          className="gap-1.5"
        >
          <Plus size={16} />
          New Search
        </Button>
      </div>

      {/* New Search Form */}
      {showNewSearch && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Add a LinkedIn Job Search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              Go to{" "}
              <span className="font-medium text-[var(--text-primary)]">
                linkedin.com/jobs
              </span>
              , set your filters (title, location, etc.), then copy the full URL from your browser&apos;s address bar.
            </p>
            <Input
              placeholder="Search name (e.g. PM roles LA)"
              value={newSearchName}
              onChange={(e) => setNewSearchName(e.target.value)}
              className="border-[var(--border-input)] bg-[var(--bg-card)]"
            />
            <Input
              placeholder="Paste LinkedIn search URL..."
              value={newSearchUrl}
              onChange={(e) => setNewSearchUrl(e.target.value)}
              className="border-[var(--border-input)] bg-[var(--bg-card)]"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSaveSearch}
                disabled={!newSearchUrl.trim() || !newSearchName.trim() || savingSearch}
                size="sm"
              >
                {savingSearch ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Search"
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowNewSearch(false);
                  setNewSearchUrl("");
                  setNewSearchName("");
                }}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {savedSearches.map((search) => (
            <div
              key={search.id}
              className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                activeSearchId === search.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              }`}
              onClick={() => handleRunSearch(search)}
            >
              <Search size={14} />
              <span>{search.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSearch(search.id);
                }}
                className="ml-1 hidden rounded-full p-0.5 hover:bg-[var(--bg-card)] group-hover:block"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {savedSearches.length === 0 && !showNewSearch && (
        <Card className="py-12 text-center">
          <CardContent>
            <Search className="mx-auto mb-4 h-12 w-12 text-[var(--text-faint)]" />
            <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
              No saved searches yet
            </h2>
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Add a LinkedIn job search URL to start finding jobs that match your profile.
            </p>
            <Button onClick={() => setShowNewSearch(true)} className="gap-1.5">
              <Plus size={16} />
              Add Your First Search
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Scraping State */}
      {scraping && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-[var(--accent)]" />
          <p className="text-sm text-[var(--text-muted)]">
            Scraping LinkedIn jobs... this may take a minute
          </p>
        </div>
      )}

      {/* Job Cards */}
      {!scraping && visibleJobs.length > 0 && (
        <div className="space-y-3">
          {visibleJobs.map((job) => {
            const uj = userJobs.get(job.id);
            const isSaved = uj?.status === "saved";
            const isUnseen = !uj || uj.status === "unseen";
            const salary = formatSalary(job.salary_info);

            return (
              <Card
                key={job.id}
                className={`transition-colors ${
                  isUnseen ? "" : "opacity-80"
                }`}
              >
                <CardContent className="flex gap-4 py-4">
                  {/* Company Logo */}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                    {job.company_logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={job.company_logo}
                        alt=""
                        className="h-10 w-10 rounded object-contain"
                      />
                    ) : (
                      <Building2 size={20} className="text-[var(--text-faint)]" />
                    )}
                  </div>

                  {/* Job Info */}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[var(--text-primary)] leading-tight">
                      {job.title || "Untitled Position"}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      {job.company_name || "Unknown Company"}
                    </p>

                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-faint)]">
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {job.location}
                        </span>
                      )}
                      {salary && (
                        <span className="flex items-center gap-1">
                          <DollarSign size={12} />
                          {salary}
                        </span>
                      )}
                      {job.posted_at && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatPostedDate(job.posted_at)}
                        </span>
                      )}
                      {job.applicants_count != null && (
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {job.applicants_count.toLocaleString()} applicants
                        </span>
                      )}
                    </div>

                    {(job.employment_type || job.seniority_level) && (
                      <div className="mt-2 flex gap-1.5">
                        {job.employment_type && (
                          <Badge variant="outline" className="text-xs">
                            {job.employment_type}
                          </Badge>
                        )}
                        {job.seniority_level && (
                          <Badge variant="outline" className="text-xs">
                            {job.seniority_level}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 flex-col gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleAnalyze(job)}
                      className="gap-1.5 text-xs"
                    >
                      <Sparkles size={14} />
                      Analyze
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateJobStatus(
                          job.id,
                          isSaved ? "unseen" : "saved"
                        )
                      }
                      className="gap-1.5 text-xs"
                    >
                      {isSaved ? (
                        <>
                          <BookmarkCheck size={14} />
                          Saved
                        </>
                      ) : (
                        <>
                          <Bookmark size={14} />
                          Save
                        </>
                      )}
                    </Button>
                    <div className="flex gap-1">
                      {job.apply_url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => window.open(job.apply_url!, "_blank")}
                          title="View on LinkedIn"
                        >
                          <ExternalLink size={14} />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-[var(--text-faint)] hover:text-red-500"
                        onClick={() => updateJobStatus(job.id, "dismissed")}
                        title="Dismiss"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* No results after search */}
      {!scraping && activeSearchId && visibleJobs.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No jobs found for this search. Try adjusting your LinkedIn search filters.
          </p>
        </div>
      )}
    </div>
  );
}
