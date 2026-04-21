"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Sparkles,
  Plus,
  MapPin,
  Clock,
  Users,
  DollarSign,
  Trash2,
  ArrowUpDown,
  Filter,
  ChevronDown,
  Send,
} from "lucide-react";
import { CompanyLogo } from "@/components/jobs/company-logo";
import { detectATS } from "@/lib/ats-detect";
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
  industries: string[] | null;
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

type SortField = "posted_at" | "applicants_count" | "company_name" | "title";
type SortDir = "asc" | "desc";

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

  // URL builder state
  const [builderKeywords, setBuilderKeywords] = useState("");
  const [builderLocation, setBuilderLocation] = useState("");
  const [builderWorkType, setBuilderWorkType] = useState<"" | "1" | "2" | "3">("");
  const [builderDatePosted, setBuilderDatePosted] = useState<"" | "r86400" | "r604800" | "r2592000">("");
  const [builderExperience, setBuilderExperience] = useState<string[]>([]);
  const [builderJobType, setBuilderJobType] = useState<"" | "F" | "P" | "C" | "T">("");
  const [builderSortBy, setBuilderSortBy] = useState<"" | "DD" | "R">("");
  const [showAdvancedUrl, setShowAdvancedUrl] = useState(false);

  function buildLinkedInUrl(): string {
    const params = new URLSearchParams();
    if (builderKeywords) params.set("keywords", builderKeywords);
    if (builderLocation) params.set("location", builderLocation);
    if (builderWorkType) params.set("f_WT", builderWorkType);
    if (builderDatePosted) params.set("f_TPR", builderDatePosted);
    if (builderExperience.length) params.set("f_E", builderExperience.join(","));
    if (builderJobType) params.set("f_JT", builderJobType);
    if (builderSortBy) params.set("sortBy", builderSortBy);
    params.set("position", "1");
    params.set("pageNum", "0");
    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  }

  function autoSearchName(): string {
    const parts = [];
    if (builderKeywords) parts.push(builderKeywords);
    if (builderLocation) parts.push(builderLocation);
    const wtLabel = builderWorkType === "2" ? "Remote" : builderWorkType === "3" ? "Hybrid" : builderWorkType === "1" ? "On-site" : "";
    if (wtLabel) parts.push(wtLabel);
    return parts.join(" · ");
  }

  function toggleExperience(val: string) {
    setBuilderExperience((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  // Filters & sorting
  const [sortField, setSortField] = useState<SortField>("posted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [filterEmploymentType, setFilterEmploymentType] = useState<string>("");
  const [filterSeniority, setFilterSeniority] = useState<string>("");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

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

  // Derived filter options from current jobs
  const filterOptions = useMemo(() => {
    const companies = new Set<string>();
    const employmentTypes = new Set<string>();
    const seniorityLevels = new Set<string>();
    const locations = new Set<string>();

    jobs.forEach((j) => {
      if (j.company_name) companies.add(j.company_name);
      if (j.employment_type) employmentTypes.add(j.employment_type);
      if (j.seniority_level) seniorityLevels.add(j.seniority_level);
      if (j.location) locations.add(j.location);
    });

    return {
      companies: Array.from(companies).sort(),
      employmentTypes: Array.from(employmentTypes).sort(),
      seniorityLevels: Array.from(seniorityLevels).sort(),
      locations: Array.from(locations).sort(),
    };
  }, [jobs]);

  // Filtered and sorted jobs
  const visibleJobs = useMemo(() => {
    const filtered = jobs.filter((j) => {
      const uj = userJobs.get(j.id);
      if (uj?.status === "dismissed") return false;
      if (filterCompany && j.company_name !== filterCompany) return false;
      if (filterEmploymentType && j.employment_type !== filterEmploymentType) return false;
      if (filterSeniority && j.seniority_level !== filterSeniority) return false;
      if (filterLocation && j.location !== filterLocation) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let valA: string | number | null = null;
      let valB: string | number | null = null;

      switch (sortField) {
        case "posted_at":
          valA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
          valB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
          break;
        case "applicants_count":
          valA = a.applicants_count ?? 0;
          valB = b.applicants_count ?? 0;
          break;
        case "company_name":
          valA = (a.company_name || "").toLowerCase();
          valB = (b.company_name || "").toLowerCase();
          break;
        case "title":
          valA = (a.title || "").toLowerCase();
          valB = (b.title || "").toLowerCase();
          break;
      }

      if (valA === valB) return 0;
      if (typeof valA === "string" && typeof valB === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      const numA = valA as number;
      const numB = valB as number;
      return sortDir === "asc" ? numA - numB : numB - numA;
    });

    return filtered;
  }, [jobs, userJobs, filterCompany, filterEmploymentType, filterSeniority, filterLocation, sortField, sortDir]);

  const activeFilterCount = [filterCompany, filterEmploymentType, filterSeniority, filterLocation].filter(Boolean).length;

  async function handleSaveSearch() {
    const url = newSearchUrl.trim() || buildLinkedInUrl();
    const name = newSearchName.trim() || autoSearchName();
    if (!user || !url || !name) return;
    setSavingSearch(true);

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(url.toLowerCase().replace(/\/+$/, ""));
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const { error } = await supabase.from("user_saved_searches").insert({
        user_id: user.id,
        name,
        search_url: url,
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
    const params = new URLSearchParams();
    if (job.description_text) params.set("jd", job.description_text);
    if (job.company_name) params.set("company", job.company_name);
    if (job.title) params.set("title", job.title);
    router.push(`/generate?${params.toString()}`);
  }

  function handleApply(job: Job) {
    if (!job.apply_url) return;
    const detected = detectATS(job.apply_url);
    if (detected) {
      router.push(`/apply?url=${encodeURIComponent(job.apply_url)}`);
    } else {
      window.open(job.apply_url, "_blank");
    }
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
    if (Array.isArray(info)) return info.join(" - ");
    const min = info.min || info.minimum || info.from;
    const max = info.max || info.maximum || info.to;
    const currency = (info.currency as string) || "$";
    if (min && max) return `${currency}${Number(min).toLocaleString()} - ${currency}${Number(max).toLocaleString()}`;
    if (min) return `From ${currency}${Number(min).toLocaleString()}`;
    if (max) return `Up to ${currency}${Number(max).toLocaleString()}`;
    return null;
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "posted_at" || field === "applicants_count" ? "desc" : "asc");
    }
  }

  function clearFilters() {
    setFilterCompany("");
    setFilterEmploymentType("");
    setFilterSeniority("");
    setFilterLocation("");
  }

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
          <span className="hidden sm:inline">New Search</span>
        </Button>
      </div>

      {/* New Search Form */}
      {showNewSearch && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">New Job Search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Builder */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Job Title / Keywords
                </label>
                <Input
                  placeholder="e.g. Product Manager"
                  value={builderKeywords}
                  onChange={(e) => {
                    setBuilderKeywords(e.target.value);
                    setNewSearchUrl(buildLinkedInUrl());
                    if (!newSearchName || newSearchName === autoSearchName()) {
                      setNewSearchName(autoSearchName());
                    }
                  }}
                  className="border-[var(--border-input)] bg-[var(--bg-card)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Location
                </label>
                <Input
                  placeholder="e.g. Los Angeles, CA"
                  value={builderLocation}
                  onChange={(e) => {
                    setBuilderLocation(e.target.value);
                    setNewSearchUrl(buildLinkedInUrl());
                    if (!newSearchName || newSearchName === autoSearchName()) {
                      setNewSearchName(autoSearchName());
                    }
                  }}
                  className="border-[var(--border-input)] bg-[var(--bg-card)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Work Type
                </label>
                <select
                  value={builderWorkType}
                  onChange={(e) => {
                    setBuilderWorkType(e.target.value as "" | "1" | "2" | "3");
                    setNewSearchUrl(buildLinkedInUrl());
                  }}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Any</option>
                  <option value="1">On-site</option>
                  <option value="2">Remote</option>
                  <option value="3">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Date Posted
                </label>
                <select
                  value={builderDatePosted}
                  onChange={(e) => {
                    setBuilderDatePosted(e.target.value as "" | "r86400" | "r604800" | "r2592000");
                    setNewSearchUrl(buildLinkedInUrl());
                  }}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Any time</option>
                  <option value="r86400">Past 24 hours</option>
                  <option value="r604800">Past week</option>
                  <option value="r2592000">Past month</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Job Type
                </label>
                <select
                  value={builderJobType}
                  onChange={(e) => {
                    setBuilderJobType(e.target.value as "" | "F" | "P" | "C" | "T");
                    setNewSearchUrl(buildLinkedInUrl());
                  }}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Any</option>
                  <option value="F">Full-time</option>
                  <option value="P">Part-time</option>
                  <option value="C">Contract</option>
                  <option value="T">Temporary</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Sort By
                </label>
                <select
                  value={builderSortBy}
                  onChange={(e) => {
                    setBuilderSortBy(e.target.value as "" | "DD" | "R");
                    setNewSearchUrl(buildLinkedInUrl());
                  }}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Most Relevant</option>
                  <option value="DD">Most Recent</option>
                  <option value="R">Most Relevant</option>
                </select>
              </div>
            </div>

            {/* Experience Level — multi-select chips */}
            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">
                Experience Level <span className="font-normal">(select all that apply)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { val: "1", label: "Internship" },
                  { val: "2", label: "Entry level" },
                  { val: "3", label: "Associate" },
                  { val: "4", label: "Mid-Senior" },
                  { val: "5", label: "Director" },
                  { val: "6", label: "Executive" },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => toggleExperience(val)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      builderExperience.includes(val)
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium"
                        : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search name */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Search Name
              </label>
              <Input
                placeholder="e.g. PM roles LA Remote"
                value={newSearchName}
                onChange={(e) => setNewSearchName(e.target.value)}
                className="border-[var(--border-input)] bg-[var(--bg-card)]"
              />
            </div>

            {/* Advanced: show built URL */}
            <div>
              <button
                onClick={() => setShowAdvancedUrl(!showAdvancedUrl)}
                className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)]"
              >
                {showAdvancedUrl ? "Hide" : "Show"} search URL
              </button>
              {showAdvancedUrl && (
                <div className="mt-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
                  <p className="break-all font-mono text-xs text-[var(--text-muted)]">
                    {builderKeywords || builderLocation ? buildLinkedInUrl() : "Fill in keywords or location above"}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const url = buildLinkedInUrl();
                  setNewSearchUrl(url);
                  const name = newSearchName || autoSearchName();
                  setNewSearchName(name);
                  handleSaveSearch();
                }}
                disabled={!builderKeywords.trim() || !newSearchName.trim() || savingSearch}
                size="sm"
                className="bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]"
              >
                {savingSearch ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save & Search"
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowNewSearch(false);
                  setNewSearchUrl("");
                  setNewSearchName("");
                  setBuilderKeywords("");
                  setBuilderLocation("");
                  setBuilderWorkType("");
                  setBuilderDatePosted("");
                  setBuilderExperience([]);
                  setBuilderJobType("");
                  setBuilderSortBy("");
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
        <div className="mb-4 flex flex-wrap gap-2">
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

      {/* Filters & Sorting Bar */}
      {jobs.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort buttons */}
            <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <ArrowUpDown size={14} />
              <span className="hidden sm:inline">Sort:</span>
            </div>
            {([
              { field: "posted_at" as SortField, label: "Date" },
              { field: "applicants_count" as SortField, label: "Applicants" },
              { field: "company_name" as SortField, label: "Company" },
              { field: "title" as SortField, label: "Title" },
            ]).map(({ field, label }) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  sortField === field
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)]"
                }`}
              >
                {label}
                {sortField === field && (
                  <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}

            <div className="ml-auto">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)]"
                }`}
              >
                <Filter size={12} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-black">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown size={12} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>

          {/* Filter dropdowns */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
              <div className="w-full sm:w-auto">
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Company</label>
                <select
                  value={filterCompany}
                  onChange={(e) => setFilterCompany(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] sm:w-44"
                >
                  <option value="">All companies</option>
                  {filterOptions.companies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-auto">
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Location</label>
                <select
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] sm:w-44"
                >
                  <option value="">All locations</option>
                  {filterOptions.locations.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="w-[calc(50%-4px)] sm:w-auto">
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Type</label>
                <select
                  value={filterEmploymentType}
                  onChange={(e) => setFilterEmploymentType(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] sm:w-36"
                >
                  <option value="">All types</option>
                  {filterOptions.employmentTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="w-[calc(50%-4px)] sm:w-auto">
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Level</label>
                <select
                  value={filterSeniority}
                  onChange={(e) => setFilterSeniority(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] sm:w-36"
                >
                  <option value="">All levels</option>
                  {filterOptions.seniorityLevels.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {activeFilterCount > 0 && (
                <div className="flex w-full items-end sm:w-auto">
                  <button
                    onClick={clearFilters}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Results count */}
          <p className="text-xs text-[var(--text-muted)]">
            {visibleJobs.length} of {jobs.length} jobs
            {activeFilterCount > 0 && " (filtered)"}
          </p>
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
                className={`transition-colors ${isUnseen ? "" : "opacity-80"}`}
              >
                <CardContent className="p-4">
                  {/* Top row: logo + info + actions (desktop) */}
                  <div className="flex gap-3 sm:gap-4">
                    {/* Company Logo */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] sm:h-12 sm:w-12">
                      <CompanyLogo logoUrl={job.company_logo} companyName={job.company_name} />
                    </div>

                    {/* Job Info */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-[var(--text-primary)] leading-tight text-sm sm:text-base">
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
                        <div className="mt-2 flex flex-wrap gap-1.5">
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

                    {/* Desktop Actions */}
                    <div className="hidden flex-shrink-0 flex-col gap-1.5 sm:flex">
                      <Button
                        size="sm"
                        onClick={() => handleAnalyze(job)}
                        className="gap-1.5 text-xs"
                      >
                        <Sparkles size={14} />
                        Analyze
                      </Button>
                      {job.apply_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApply(job)}
                          className="gap-1.5 text-xs"
                        >
                          <Send size={14} />
                          Apply
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateJobStatus(job.id, isSaved ? "unseen" : "saved")
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

                  {/* Mobile Actions */}
                  <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3 sm:hidden">
                    <Button
                      size="sm"
                      onClick={() => handleAnalyze(job)}
                      className="flex-1 gap-1.5 text-xs"
                    >
                      <Sparkles size={14} />
                      Analyze
                    </Button>
                    {job.apply_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApply(job)}
                        className="gap-1.5 text-xs"
                      >
                        <Send size={14} />
                        Apply
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateJobStatus(job.id, isSaved ? "unseen" : "saved")
                      }
                      className="gap-1.5 text-xs"
                    >
                      {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 text-[var(--text-faint)] hover:text-red-500"
                      onClick={() => updateJobStatus(job.id, "dismissed")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* No results after search */}
      {!scraping && activeSearchId && visibleJobs.length === 0 && jobs.length > 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No jobs match your filters.{" "}
            <button onClick={clearFilters} className="text-[var(--accent)] hover:underline">
              Clear filters
            </button>
          </p>
        </div>
      )}

      {!scraping && activeSearchId && jobs.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No jobs found for this search. Try adjusting your LinkedIn search filters.
          </p>
        </div>
      )}
    </div>
  );
}
