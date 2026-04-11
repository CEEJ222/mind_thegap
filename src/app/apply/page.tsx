"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { ResumePreviewModal } from "@/components/resume/resume-preview-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Send,
  ArrowLeft,
  Link2,
  MapPin,
  Building2,
  FileText,
  Sparkles,
  Eye,
  ExternalLink,
} from "lucide-react";

type ATSType = "lever" | "greenhouse" | "ashby";
type Step = "input" | "loading" | "review" | "submitting" | "success" | "error" | "manual";

interface FormField {
  // Lever fields
  name?: string
  type?: string
  required?: boolean
  label?: string
  options?: Array<{ label: string; value: string | number }>
  // Greenhouse
  id?: string
  fields?: Array<{
    name: string
    type: string
    values?: Array<{ label: string; value: string | number }>
  }>
  // Ashby
  path?: string
}

interface ParseResult {
  atsType: ATSType
  applicationId: string
  job: {
    title: string
    company?: string
    location?: string | null
    descriptionPlain: string
    absoluteUrl?: string
  }
  formFields: FormField[]
  prefilled: Record<string, string>
  postingUnavailable?: boolean
}

const ATS_BADGE_COLORS: Record<ATSType, string> = {
  lever: "bg-[#4CAF50]/15 text-[#2E7D32] border-[#4CAF50]/30",
  greenhouse: "bg-[#4CAF50]/15 text-[#1B5E20] border-[#4CAF50]/30",
  ashby: "bg-purple-100 text-purple-800 border-purple-200",
};

const ATS_LABELS: Record<ATSType, string> = {
  lever: "Lever",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
};

const SUPPORTED_PLACEHOLDER = `Paste a job URL:
  jobs.lever.co/company/job-id
  boards.greenhouse.io/company/jobs/12345
  jobs.ashbyhq.com/company/job-id`;

function normalizeFormFields(
  atsType: ATSType,
  formFields: FormField[]
): Array<{ key: string; label: string; type: string; required: boolean; options?: Array<{ label: string; value: string }> }> {
  if (atsType === "lever") {
    return formFields.map((f) => ({
      key: f.name!,
      label: f.label!,
      type: f.type === "file" ? "file" : f.type === "textarea" ? "textarea" : f.type === "url" ? "url" : "text",
      required: !!f.required,
      options: f.options as Array<{ label: string; value: string }> | undefined,
    }));
  }

  if (atsType === "greenhouse") {
    const normalized: Array<{ key: string; label: string; type: string; required: boolean; options?: Array<{ label: string; value: string }> }> = [];
    for (const q of formFields) {
      for (const field of q.fields || []) {
        // Skip file fields and resume text-paste fields (handled via file upload separately)
        if (field.type === "input_file") continue;
        if (field.name === "resume" || field.name === "resume_text" || (field.name.includes("resume") && field.type !== "input_file")) continue;
        normalized.push({
          key: field.name,
          label: q.label || field.name,
          type: field.type === "input_file" ? "file"
            : field.type === "textarea" ? "textarea"
            : field.type === "multi_value_single_select" ? "select"
            : "text",
          required: !!q.required,
          options: field.values?.map((v) => ({ label: String(v.label), value: String(v.value) })),
        });
      }
    }
    return normalized;
  }

  if (atsType === "ashby") {
    return formFields.map((f) => ({
      key: f.path!,
      label: f.label || f.path!,
      type: f.type === "File" ? "file"
        : f.type === "LongText" ? "textarea"
        : f.type === "Boolean" ? "checkbox"
        : f.type === "ValueSelect" ? "select"
        : "text",
      required: !!f.required,
      options: f.options as Array<{ label: string; value: string }> | undefined,
    }));
  }

  return [];
}

export default function ApplyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("input");
  const [urlInput, setUrlInput] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [resumeWarning, setResumeWarning] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [hasResume, setHasResume] = useState<boolean | null>(null); // null = checking
  const [previewingResume, setPreviewingResume] = useState(false);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [positionClosed, setPositionClosed] = useState(false);

  // Pre-fill URL from query param (job card "Apply" button) or load existing applicationId
  useEffect(() => {
    const urlParam = searchParams.get("url");
    const appIdParam = searchParams.get("applicationId");
    const resumeIdParam = searchParams.get("resume_id");

    if (resumeIdParam) {
      setResumeId(resumeIdParam);
    }

    if (appIdParam) {
      // Restore existing draft by re-fetching form fields
      handleParseById(appIdParam);
    } else if (urlParam) {
      setUrlInput(urlParam);
      handleParse(urlParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for existing resume whenever we have a parsed applicationId
  useEffect(() => {
    const appId = parseResult?.applicationId;
    if (!appId) return;
    // If we already have a resumeId (from URL param or prior check), trust it
    if (resumeId) {
      setHasResume(true);
      return;
    }
    setHasResume(null);
    supabase
      .from("generated_resumes")
      .select("id")
      .eq("application_id", appId)
      .limit(1)
      .then(({ data }: { data: Array<{ id: string }> | null }) => {
        if (data && data.length > 0) {
          setHasResume(true);
          setResumeId(data[0].id);
        } else {
          setHasResume(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseResult?.applicationId, resumeId]);

  async function handleParse(url?: string) {
    const target = url ?? urlInput.trim();
    if (!target || !user) return;
    setStep("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/apply/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target, user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch job");

      setParseResult(data);
      setAnswers(data.prefilled || {});
      setStep("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load job");
      setStep("error");
    }
  }

  async function handleParseById(applicationId: string) {
    if (!user) return;
    setStep("loading");
    setErrorMsg("");
    try {
      // Load existing application row from DB
      const { data: app } = await supabase
        .from("applications")
        .select("source_url, source_type, form_answers, company_name, job_title, jd_text")
        .eq("id", applicationId)
        .single();

      if (!app?.source_url) throw new Error("Application not found or missing source URL");

      // Re-fetch form fields from ATS to rebuild the review UI
      const res = await fetch("/api/apply/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: app.source_url, user_id: user.id, existingApplicationId: applicationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reload job");

      // Use stored form_answers if no new prefilled answers
      const savedAnswers = (app.form_answers as Record<string, string>) || {};
      setParseResult({ ...data, applicationId });
      setAnswers({ ...data.prefilled, ...savedAnswers });
      setStep("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load application");
      setStep("error");
    }
  }

  async function handleSubmit() {
    if (!parseResult || !user) return;
    setStep("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/apply/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: parseResult.applicationId,
          confirmed: true,
          form_answers: answers,
          resume_id: resumeId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404 || data.closed) {
          setPositionClosed(true);
          setStep("review");
        } else if (data.manualFallback) {
          // Headless browser failed — let user submit manually
          setStep("manual");
        } else {
          setErrorMsg(data.error || "Submission failed");
          setStep("error");
        }
        return;
      }

      setResumeWarning(!!data.resumeWarning);
      setStep("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
      setStep("error");
    }
  }

  function handleBack() {
    setStep("input");
    setParseResult(null);
    setAnswers({});
    setErrorMsg("");
    setResumeId(null);
    setHasResume(null);
    setPositionClosed(false);
  }

  async function handleGenerateResume() {
    if (!parseResult || !user) return;
    setGeneratingResume(true);
    try {
      const res = await fetch("/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: parseResult.applicationId, user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resume generation failed");
      setResumeId(data.resume_id);
      setHasResume(true);
    } catch (err) {
      console.error("Generate resume error:", err);
    } finally {
      setGeneratingResume(false);
    }
  }

  // Loading state
  if (step === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        <p className="text-sm text-[var(--text-muted)]">Fetching job and form fields…</p>
      </div>
    );
  }

  // Submitting state
  if (step === "submitting") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        <p className="text-sm text-[var(--text-muted)]">Submitting your application…</p>
      </div>
    );
  }

  // Manual submission step (Greenhouse — requires browser-side submit)
  if (step === "manual" && parseResult) {
    const handleMarkApplied = async () => {
      if (!user) return;
      await fetch("/api/apply/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: parseResult.applicationId,
          confirmed: true,
          form_answers: answers,
          manual: true,
        }),
      });
      setStep("success");
    };

    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <ExternalLink className="mx-auto mb-4 h-12 w-12 text-[var(--accent)]" />
        <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Complete in Greenhouse</h1>
        <p className="mb-2 text-sm text-[var(--text-muted)]">
          Greenhouse requires direct browser submission. The form has been opened in a new tab with your job details.
        </p>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          Once you&apos;ve submitted the form, click below to mark this application as applied.
        </p>
        <div className="mb-6 flex gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => window.open(parseResult.job.absoluteUrl || urlInput, "_blank")}
          >
            <ExternalLink size={14} />
            Reopen Form
          </Button>
        </div>
        <div className="flex gap-2 justify-center">
          <Button onClick={handleMarkApplied} className="gap-2 bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]">
            <CheckCircle2 size={16} />
            I&apos;ve Submitted
          </Button>
          <Button variant="outline" onClick={() => setStep("review")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (step === "success") {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[var(--accent)]" />
        <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Application Submitted</h1>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          {parseResult?.job.title} at {parseResult?.job.company}
        </p>
        {resumeWarning && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Resume could not be attached — you may need to upload it manually on the company&apos;s portal.</span>
          </div>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={() => router.push("/applications")} className="gap-2">
            View Applications
          </Button>
          <Button variant="outline" onClick={() => { setStep("input"); setParseResult(null); setAnswers({}); setUrlInput(""); }}>
            Apply to Another
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-400" />
        <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">Something went wrong</h1>
        <p className="mb-6 text-sm text-red-500">{errorMsg}</p>
        <Button variant="outline" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // Review form
  if (step === "review" && parseResult) {
    const { atsType, job } = parseResult;
    const fields = normalizeFormFields(atsType, parseResult.formFields);
    // Filter out file fields and system fields we don't render
    const renderableFields = fields.filter((f) => f.type !== "file");

    return (
      <div className="mx-auto max-w-2xl px-4 pb-16">
        {previewingResume && resumeId && (
          <ResumePreviewModal resumeId={resumeId} onClose={() => setPreviewingResume(false)} />
        )}
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <button
            onClick={handleBack}
            className="mt-1 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">
                Review Application
              </h1>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ATS_BADGE_COLORS[atsType]}`}>
                {ATS_LABELS[atsType]}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{job.title}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
              {job.company && (
                <span className="flex items-center gap-1">
                  <Building2 size={12} />
                  {job.company}
                </span>
              )}
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} />
                  {job.location}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Posting unavailable / closed warning */}
        {(parseResult.postingUnavailable || positionClosed) && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>This job posting is no longer listed publicly — it may have been filled or closed. You can still attempt to submit, but the application may be rejected.</span>
          </div>
        )}

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Information</CardTitle>
            <p className="text-xs text-[var(--text-muted)]">
              Pre-filled from your profile. Review and edit before submitting.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderableFields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </label>

                {field.type === "textarea" ? (
                  <Textarea
                    value={answers[field.key] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    rows={4}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
                  />
                ) : field.type === "select" && field.options?.length ? (
                  <select
                    value={answers[field.key] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    <option value="">Select…</option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : field.type === "checkbox" ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={answers[field.key] === "true"}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [field.key]: e.target.checked ? "true" : "false" }))}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-[var(--text-muted)]">{field.label}</span>
                  </label>
                ) : (
                  <Input
                    type={field.type === "url" ? "url" : field.type === "email" ? "email" : "text"}
                    value={answers[field.key] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    className="border-[var(--border-input)] bg-[var(--bg-card)]"
                  />
                )}
              </div>
            ))}

          </CardContent>
        </Card>

        {/* Resume section */}
        <div className="mt-4">
          {hasResume === null && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking for resume…
            </div>
          )}
          {hasResume === true && (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Resume ready — will be attached to your application.
              </div>
              <button
                onClick={() => setPreviewingResume(true)}
                className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900"
              >
                <Eye size={13} />
                Preview
              </button>
            </div>
          )}
          {hasResume === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2 text-sm text-amber-800">
                <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">No resume generated for this job</p>
                  <p className="mt-0.5 text-xs text-amber-700">Generate a tailored resume to attach to your application.</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={handleGenerateResume}
                disabled={generatingResume}
              >
                {generatingResume ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {generatingResume ? "Generating…" : "Generate Resume"}
              </Button>
            </div>
          )}
        </div>

        {/* Confirm button */}
        <div className="mt-4 flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={generatingResume}
            className="flex-1 gap-2 bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)] disabled:opacity-50"
            size="lg"
          >
            <Send size={16} />
            Submit Application
          </Button>
          <Button variant="outline" onClick={handleBack}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // URL input (default)
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-16">
      <Link2 className="mb-4 h-10 w-10 text-[var(--accent)]" />
      <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)] text-center">
        Auto-Apply
      </h1>
      <p className="mb-8 text-sm text-[var(--text-muted)] text-center">
        Paste a job URL from Lever, Greenhouse, or Ashby
      </p>

      <div className="w-full space-y-3">
        <Input
          type="url"
          placeholder={SUPPORTED_PLACEHOLDER}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleParse()}
          className="border-[var(--border-input)] bg-[var(--bg-card)]"
        />

        <div className="flex flex-wrap gap-1.5">
          {(["lever", "greenhouse", "ashby"] as ATSType[]).map((ats) => (
            <Badge
              key={ats}
              variant="outline"
              className={`text-xs ${ATS_BADGE_COLORS[ats]}`}
            >
              {ATS_LABELS[ats]}
            </Badge>
          ))}
        </div>

        <Button
          onClick={() => handleParse()}
          disabled={!urlInput.trim()}
          className="w-full"
          size="lg"
        >
          Fetch Job & Pre-fill Form
        </Button>
      </div>
    </div>
  );
}
