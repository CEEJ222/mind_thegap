"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { showSnackbar } from "@/components/ui/snackbar";
import {
  BookmarkCheck,
  Sparkles,
  MapPin,
  Building2,
  Clock,
  Users,
  DollarSign,
  Trash2,
  Bookmark,
  ArrowUpDown,
  Filter,
  ChevronDown,
  Loader2,
  CheckCircle2,
  Zap,
  Send,
} from "lucide-react";
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

type SortField = "posted_at" | "applicants_count" | "company_name" | "title";
type SortDir = "asc" | "desc";
type CardState = "idle" | "analyzing" | "generating" | "done" | "error";

export default function SavedJobsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Batch generation state
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());

  // Filters & sorting
  const [sortField, setSortField] = useState<SortField>("posted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [filterEmploymentType, setFilterEmploymentType] = useState<string>("");
  const [filterSeniority, setFilterSeniority] = useState<string>("");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const loadSavedJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Only load saved jobs that don't have a resume generated yet
    const { data: userJobs } = await supabase
      .from("user_jobs")
      .select("job_id")
      .eq("user_id", user.id)
      .eq("status", "saved")
      .is("resume_id", null);

    if (!userJobs?.length) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const jobIds = userJobs.map((uj: { job_id: string }) => uj.job_id);

    const { data: jobData } = await supabase
      .from("jobs")
      .select("*")
      .in("id", jobIds);

    setJobs(jobData || []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    loadSavedJobs();
  }, [loadSavedJobs]);

  function setCardState(jobId: string, state: CardState) {
    setCardStates((prev) => new Map(prev).set(jobId, state));
  }

  async function generateForJob(job: Job): Promise<boolean> {
    if (!user || !job.description_text) return false;

    try {
      setCardState(job.id, "analyzing");

      // Step 1: Analyze
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: job.description_text, user_id: user.id }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error);

      setCardState(job.id, "generating");

      // Step 2: Generate resume
      const genRes = await fetch("/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: analyzeData.application_id,
          user_id: user.id,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error);

      // Step 3: Update user_jobs with resume_id + application_id → removes from saved view
      await supabase
        .from("user_jobs")
        .update({
          resume_id: genData.resume_id,
          application_id: analyzeData.application_id,
        })
        .eq("user_id", user.id)
        .eq("job_id", job.id);

      setCardState(job.id, "done");

      // Remove from list after brief "done" flash
      setTimeout(() => {
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      }, 1200);

      return true;
    } catch (err) {
      console.error(`Failed to generate resume for ${job.company_name}:`, err);
      setCardState(job.id, "error");
      return false;
    }
  }

  async function handleBatchGenerate() {
    if (!user || batchRunning) return;

    const queue = [...visibleJobs].filter((j) => j.description_text);
    if (!queue.length) {
      showSnackbar("No jobs with descriptions to process", "error");
      return;
    }

    setBatchRunning(true);
    setBatchProgress(0);
    setBatchTotal(queue.length);

    let succeeded = 0;
    let failed = 0;

    for (const job of queue) {
      const ok = await generateForJob(job);
      if (ok) succeeded++;
      else failed++;
      setBatchProgress((prev) => prev + 1);
    }

    setBatchRunning(false);
    if (failed === 0) {
      showSnackbar(`${succeeded} resume${succeeded !== 1 ? "s" : ""} generated — check Applications`);
      setTimeout(() => router.push("/applications"), 1500);
    } else {
      showSnackbar(`${succeeded} generated, ${failed} failed`, "error");
    }
  }

  // Derived filter options
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

  // Filtered and sorted
  const visibleJobs = useMemo(() => {
    const filtered = jobs.filter((j) => {
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
  }, [jobs, filterCompany, filterEmploymentType, filterSeniority, filterLocation, sortField, sortDir]);

  const activeFilterCount = [filterCompany, filterEmploymentType, filterSeniority, filterLocation].filter(Boolean).length;

  async function unsaveJob(jobId: string) {
    if (!user) return;
    await supabase.from("user_jobs").upsert(
      { user_id: user.id, job_id: jobId, status: "unseen" as JobStatus },
      { onConflict: "user_id,job_id" }
    );
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    showSnackbar("Job removed from saved");
  }

  async function dismissJob(jobId: string) {
    if (!user) return;
    await supabase.from("user_jobs").upsert(
      { user_id: user.id, job_id: jobId, status: "dismissed" as JobStatus },
      { onConflict: "user_id,job_id" }
    );
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    showSnackbar("Job dismissed");
  }

  function handleAnalyzeSingle(job: Job) {
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Saved Jobs</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Jobs you&apos;ve saved for later
          </p>
        </div>
        {jobs.length > 0 && (
          <Button
            onClick={handleBatchGenerate}
            disabled={batchRunning}
            className="shrink-0 gap-2 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            {batchRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {batchProgress} of {batchTotal}
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Generate All Resumes
              </>
            )}
          </Button>
        )}
      </div>

      {/* Batch progress bar */}
      {batchRunning && (
        <div className="mb-4 overflow-hidden rounded-full bg-[var(--border-subtle)] h-1.5">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${batchTotal ? (batchProgress / batchTotal) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* Filters & Sorting Bar */}
      {jobs.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
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
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown size={12} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>

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

          <p className="text-xs text-[var(--text-muted)]">
            {visibleJobs.length} of {jobs.length} saved jobs
            {activeFilterCount > 0 && " (filtered)"}
          </p>
        </div>
      )}

      {/* Empty State */}
      {jobs.length === 0 && (
        <Card className="py-12 text-center">
          <CardContent>
            <Bookmark className="mx-auto mb-4 h-12 w-12 text-[var(--text-faint)]" />
            <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
              No saved jobs yet
            </h2>
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Save jobs from the Jobs page to review them later.
            </p>
            <Button onClick={() => router.push("/jobs")} className="gap-1.5">
              Browse Jobs
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Job Cards */}
      {visibleJobs.length > 0 && (
        <div className="space-y-3">
          {visibleJobs.map((job) => {
            const salary = formatSalary(job.salary_info);
            const cardState = cardStates.get(job.id) ?? "idle";
            const isProcessing = cardState === "analyzing" || cardState === "generating";
            const isDone = cardState === "done";
            const isError = cardState === "error";

            return (
              <Card
                key={job.id}
                className={`transition-all duration-300 ${isDone ? "opacity-40 scale-[0.99]" : ""} ${isProcessing ? "border-[var(--accent)]/40" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex gap-3 sm:gap-4">
                    {/* Company Logo */}
                    <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] sm:h-12 sm:w-12">
                      {job.company_logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={job.company_logo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 size={20} className="text-[var(--text-faint)]" />
                      )}
                      {isProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-base)]/80">
                          <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                        </div>
                      )}
                      {isDone && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]/20">
                          <CheckCircle2 size={16} className="text-[var(--accent)]" />
                        </div>
                      )}
                    </div>

                    {/* Job Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[var(--text-primary)] leading-tight text-sm sm:text-base">
                          {job.title || "Untitled Position"}
                        </h3>
                        {isProcessing && (
                          <span className="text-xs text-[var(--accent)]">
                            {cardState === "analyzing" ? "Analyzing…" : "Generating…"}
                          </span>
                        )}
                        {isDone && (
                          <span className="text-xs text-[var(--accent)]">Resume ready ✓</span>
                        )}
                        {isError && (
                          <span className="text-xs text-red-500">Failed — try individually</span>
                        )}
                      </div>
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
                            <Badge variant="outline" className="text-xs">{job.employment_type}</Badge>
                          )}
                          {job.seniority_level && (
                            <Badge variant="outline" className="text-xs">{job.seniority_level}</Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden flex-shrink-0 flex-col gap-1.5 sm:flex">
                      <Button
                        size="sm"
                        onClick={() => handleAnalyzeSingle(job)}
                        disabled={isProcessing || batchRunning}
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
                          disabled={isProcessing || batchRunning}
                          className="gap-1.5 text-xs"
                        >
                          <Send size={14} />
                          Apply
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => unsaveJob(job.id)}
                        disabled={isProcessing || batchRunning}
                        className="gap-1.5 text-xs"
                      >
                        <BookmarkCheck size={14} />
                        Unsave
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-[var(--text-faint)] hover:text-red-500"
                        onClick={() => dismissJob(job.id)}
                        disabled={isProcessing || batchRunning}
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
                      onClick={() => handleAnalyzeSingle(job)}
                      disabled={isProcessing || batchRunning}
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
                        disabled={isProcessing || batchRunning}
                        className="gap-1.5 text-xs"
                      >
                        <Send size={14} />
                        Apply
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unsaveJob(job.id)}
                      disabled={isProcessing || batchRunning}
                      className="gap-1.5 text-xs"
                    >
                      <BookmarkCheck size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 text-[var(--text-faint)] hover:text-red-500"
                      onClick={() => dismissJob(job.id)}
                      disabled={isProcessing || batchRunning}
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

      {/* Filtered empty */}
      {jobs.length > 0 && visibleJobs.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No saved jobs match your filters.{" "}
            <button onClick={clearFilters} className="text-[var(--accent)] hover:underline">
              Clear filters
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
