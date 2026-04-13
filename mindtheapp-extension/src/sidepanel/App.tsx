import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/ui/badge";
import {
  analyzeJob,
  ApiError,
  generateResume,
  getApplicationDeepLink,
  getProfile,
  getProfileDeepLink,
  getSavedJobsDeepLink,
  saveJob,
} from "@/lib/api";
import type {
  AnalyzeResponse,
  GenerateResumeResponse,
  GetAuthStateResponse,
  GetCurrentJdResponse,
  JobDescriptionPayload,
  ProfileResponse,
} from "@/lib/types";
import { cn } from "@/lib/cn";

type View =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "no-profile"; profile: ProfileResponse }
  | { kind: "authenticated-no-jd"; profile: ProfileResponse }
  | {
      kind: "jd-detected";
      profile: ProfileResponse;
      jd: JobDescriptionPayload;
    }
  | {
      kind: "analyzing";
      profile: ProfileResponse;
      jd: JobDescriptionPayload;
    }
  | {
      kind: "results";
      profile: ProfileResponse;
      jd: JobDescriptionPayload;
      analysis: AnalyzeResponse;
    }
  | {
      kind: "generating";
      profile: ProfileResponse;
      jd: JobDescriptionPayload;
      analysis: AnalyzeResponse;
    }
  | {
      kind: "resume-ready";
      profile: ProfileResponse;
      jd: JobDescriptionPayload;
      analysis: AnalyzeResponse;
      resume: GenerateResumeResponse;
    };

const SUPPORTED_ATS = [
  { label: "Greenhouse", color: "#3EB489" },
  { label: "Lever", color: "#5F3DC4" },
  { label: "Ashby", color: "#1A1A1A" },
  { label: "LinkedIn", color: "#0A66C2" },
];

function scoreColor(score: number): string {
  if (score >= 75) return "text-tier-strong";
  if (score >= 50) return "text-tier-weak";
  return "text-tier-none";
}

function sendBgMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      resolve(resp as T);
    });
  });
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; created: boolean }
  | { kind: "error"; message: string };

export default function App(): React.ReactElement {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  const hydrate = useCallback(async () => {
    setError(null);
    const authResp = await sendBgMessage<GetAuthStateResponse>({
      type: "GET_AUTH_STATE",
    });

    if (!authResp?.authenticated) {
      setView({ kind: "unauthenticated" });
      return;
    }

    // Validate the stored token with /api/profile. The API layer clears
    // the token on 401, so a fresh hydrate cycle drops the UI back to
    // the unauthenticated state.
    let profile: ProfileResponse;
    try {
      profile = await getProfile();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setView({ kind: "unauthenticated" });
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach jobseek.fyi",
      );
      setView({ kind: "unauthenticated" });
      return;
    }

    if (!profile.has_profile) {
      setView({ kind: "no-profile", profile });
      return;
    }

    const jdResp = await sendBgMessage<GetCurrentJdResponse>({
      type: "GET_CURRENT_JD",
    });
    if (jdResp?.jd) {
      setView({ kind: "jd-detected", profile, jd: jdResp.jd });
    } else {
      setView({ kind: "authenticated-no-jd", profile });
    }
  }, []);

  useEffect(() => {
    void hydrate();

    const listener = (msg: {
      type?: string;
      payload?: JobDescriptionPayload;
    }) => {
      if (msg?.type === "JD_UPDATED" && msg.payload) {
        setView((prev) => {
          // Only replace the view if we're in a state where a fresh JD is
          // meaningful — don't clobber in-flight analyze/generate flows.
          if (prev.kind === "authenticated-no-jd") {
            return { kind: "jd-detected", profile: prev.profile, jd: msg.payload! };
          }
          if (prev.kind === "jd-detected") {
            // New JD detected on the same tab — reset the save state so the
            // button shows "Save for later" again for the new posting.
            if (prev.jd.pageUrl !== msg.payload!.pageUrl) {
              setSaveState({ kind: "idle" });
            }
            return { kind: "jd-detected", profile: prev.profile, jd: msg.payload! };
          }
          return prev;
        });
      }
      if (msg?.type === "AUTH_STATE_CHANGED") {
        void hydrate();
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [hydrate]);

  const onSignIn = () => {
    void sendBgMessage({ type: "OPEN_AUTH" });
  };

  const onOpenProfileEditor = () => {
    void chrome.tabs.create({ url: getProfileDeepLink() });
  };

  const onSaveJob = async () => {
    if (view.kind !== "jd-detected") return;
    const jd = view.jd;
    setSaveState({ kind: "saving" });
    try {
      const resp = await saveJob({
        url: jd.pageUrl,
        title: jd.jobTitle,
        company: jd.company,
        description: jd.jdText,
        atsType: jd.atsType,
      });
      setSaveState({ kind: "saved", created: resp.created });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setView({ kind: "unauthenticated" });
        return;
      }
      setSaveState({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not save job",
      });
    }
  };

  const onOpenSavedJobs = () => {
    void chrome.tabs.create({ url: getSavedJobsDeepLink() });
  };

  const onAnalyze = async () => {
    if (view.kind !== "jd-detected") return;
    const { profile, jd } = view;
    setView({ kind: "analyzing", profile, jd });
    setError(null);
    try {
      const analysis = await analyzeJob({ jdText: jd.jdText });
      setView({ kind: "results", profile, jd, analysis });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setView({ kind: "unauthenticated" });
        return;
      }
      setError(err instanceof Error ? err.message : "Analysis failed");
      setView({ kind: "jd-detected", profile, jd });
    }
  };

  const onGenerate = async () => {
    if (view.kind !== "results") return;
    const { profile, jd, analysis } = view;
    setView({ kind: "generating", profile, jd, analysis });
    setError(null);
    try {
      const resume = await generateResume({
        applicationId: analysis.application_id,
      });
      setView({ kind: "resume-ready", profile, jd, analysis, resume });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setView({ kind: "unauthenticated" });
        return;
      }
      setError(err instanceof Error ? err.message : "Generation failed");
      setView({ kind: "results", profile, jd, analysis });
    }
  };

  const onCopyResume = async () => {
    if (view.kind !== "resume-ready") return;
    const markdown = view.resume.editorial_notes?.resume_content ?? "";
    if (!markdown) {
      setError("Resume content was empty");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      setError("Unable to copy to clipboard");
    }
  };

  const onOpenInJobseek = () => {
    if (view.kind !== "resume-ready") return;
    const url = getApplicationDeepLink(view.analysis.application_id);
    void chrome.tabs.create({ url });
  };

  const onSignOut = async () => {
    await sendBgMessage({ type: "SIGN_OUT" });
    setView({ kind: "unauthenticated" });
  };

  return (
    <div className="flex h-full flex-col bg-cream p-5">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md bg-turquoise text-ink"
            aria-hidden
          >
            <span className="text-lg font-bold">M</span>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Mind the App</h1>
            <p className="text-[11px] text-muted">by jobseek.fyi</p>
          </div>
        </div>
        {view.kind !== "unauthenticated" && view.kind !== "loading" ? (
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="text-xs text-muted hover:text-ink"
          >
            Sign out
          </button>
        ) : null}
      </header>

      <main className="flex-1 overflow-y-auto">
        {error ? (
          <div className="mb-3 rounded-md border border-tier-none/30 bg-tier-none/10 px-3 py-2 text-xs text-tier-none">
            {error}
          </div>
        ) : null}

        {view.kind === "loading" && <LoadingBlock label="Loading…" />}

        {view.kind === "unauthenticated" && (
          <UnauthenticatedView onSignIn={onSignIn} />
        )}

        {view.kind === "no-profile" && (
          <NoProfileView onOpenProfile={onOpenProfileEditor} />
        )}

        {view.kind === "authenticated-no-jd" && <NoJdView />}

        {view.kind === "jd-detected" && (
          <JdDetectedView
            jd={view.jd}
            saveState={saveState}
            onAnalyze={onAnalyze}
            onSave={() => void onSaveJob()}
            onOpenSavedJobs={onOpenSavedJobs}
          />
        )}

        {view.kind === "analyzing" && (
          <LoadingBlock label="Analyzing job description…" />
        )}

        {view.kind === "results" && (
          <ResultsView
            analysis={view.analysis}
            onGenerate={onGenerate}
          />
        )}

        {view.kind === "generating" && (
          <LoadingBlock label="Generating tailored resume…" />
        )}

        {view.kind === "resume-ready" && (
          <ResumeReadyView
            resume={view.resume}
            onCopy={() => void onCopyResume()}
            onOpen={onOpenInJobseek}
          />
        )}
      </main>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-turquoise" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function UnauthenticatedView({
  onSignIn,
}: {
  onSignIn: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-turquoise">
        <span className="text-3xl font-bold text-ink">M</span>
      </div>
      <div>
        <h2 className="text-lg font-bold">Welcome to Mind the App</h2>
        <p className="mt-1 text-sm text-muted">
          AI-powered gap analysis & resume generation
        </p>
      </div>
      <Button onClick={onSignIn} className="mt-2 w-full">
        Sign in to jobseek.fyi
      </Button>
    </div>
  );
}

function NoProfileView({
  onOpenProfile,
}: {
  onOpenProfile: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="text-2xl">📋</div>
      <div>
        <h2 className="text-sm font-bold">Add your profile first</h2>
        <p className="mt-1 text-xs text-muted">
          We need your experience, projects, and skills before we can
          analyze a job posting or generate a tailored resume.
        </p>
      </div>
      <Button onClick={onOpenProfile} className="mt-2 w-full">
        Open profile on jobseek.fyi ↗
      </Button>
      <p className="text-[11px] text-muted">
        Come back to this side panel once you&apos;ve added a few entries.
      </p>
    </div>
  );
}

function NoJdView(): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="text-2xl">🔍</div>
      <div>
        <h2 className="text-sm font-bold">Navigate to a job posting</h2>
        <p className="mt-1 text-xs text-muted">
          Open any supported ATS and we&apos;ll detect the description
          automatically.
        </p>
      </div>
      <div className="mt-2 grid w-full grid-cols-2 gap-2">
        {SUPPORTED_ATS.map((a) => (
          <div
            key={a.label}
            className="rounded-md border border-ink/10 bg-white/60 px-3 py-2 text-center text-xs font-semibold"
            style={{ color: a.color }}
          >
            {a.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function JdDetectedView({
  jd,
  saveState,
  onAnalyze,
  onSave,
  onOpenSavedJobs,
}: {
  jd: JobDescriptionPayload;
  saveState: SaveState;
  onAnalyze: () => void;
  onSave: () => void;
  onOpenSavedJobs: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {jd.atsType}
        </p>
        <h2 className="mt-1 text-base font-bold leading-snug">
          {jd.jobTitle || "Untitled role"}
        </h2>
        {jd.company ? (
          <p className="mt-0.5 text-sm text-muted">{jd.company}</p>
        ) : null}
        <p className="mt-3 line-clamp-5 text-xs text-ink/70">
          {jd.jdText.slice(0, 400)}
          {jd.jdText.length > 400 ? "…" : ""}
        </p>
      </Card>
      <Button onClick={onAnalyze} className="w-full" size="lg">
        Analyze This Job
      </Button>
      <SaveJobButton
        saveState={saveState}
        onSave={onSave}
        onOpenSavedJobs={onOpenSavedJobs}
      />
    </div>
  );
}

function SaveJobButton({
  saveState,
  onSave,
  onOpenSavedJobs,
}: {
  saveState: SaveState;
  onSave: () => void;
  onOpenSavedJobs: () => void;
}): React.ReactElement {
  if (saveState.kind === "saved") {
    return (
      <div className="flex items-center justify-between rounded-md border border-tier-strong/30 bg-tier-strong/10 px-3 py-2 text-xs">
        <span className="font-semibold text-tier-strong">
          ✓ {saveState.created ? "Saved to jobseek.fyi" : "Already saved"}
        </span>
        <button
          type="button"
          onClick={onOpenSavedJobs}
          className="text-tier-strong underline-offset-2 hover:underline"
        >
          View all →
        </button>
      </div>
    );
  }

  if (saveState.kind === "error") {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={onSave} className="w-full">
          Try saving again
        </Button>
        <p className="text-[11px] text-tier-none">{saveState.message}</p>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      onClick={onSave}
      className="w-full"
      disabled={saveState.kind === "saving"}
    >
      {saveState.kind === "saving" ? "Saving…" : "Save for later"}
    </Button>
  );
}

function ResultsView({
  analysis,
  onGenerate,
}: {
  analysis: AnalyzeResponse;
  onGenerate: () => void;
}): React.ReactElement {
  // Show strongest themes first so the user sees wins before gaps.
  const orderedThemes = [...analysis.themes].sort(
    (a, b) => b.score_numeric - a.score_numeric,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Overall Fit
        </p>
        <p
          className={cn(
            "mt-1 text-4xl font-bold tabular-nums",
            scoreColor(analysis.fit_score),
          )}
        >
          {Math.round(analysis.fit_score)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {analysis.job_title}
          {analysis.company_name ? ` · ${analysis.company_name}` : ""}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Themes
        </p>
        {orderedThemes.map((t) => (
          <div
            key={t.id}
            className="rounded-md border border-ink/10 bg-white/60 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold">{t.theme_name}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-ink/70">
                  {t.score_numeric}
                </span>
                <TierBadge tier={t.score_tier} />
              </div>
            </div>
            {t.explanation ? (
              <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-muted">
                {t.explanation}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <Button onClick={onGenerate} className="w-full" size="lg">
        Generate Resume
      </Button>
    </div>
  );
}

function ResumeReadyView({
  resume,
  onCopy,
  onOpen,
}: {
  resume: GenerateResumeResponse;
  onCopy: () => void;
  onOpen: () => void;
}): React.ReactElement {
  const markdown = resume.editorial_notes?.resume_content ?? "";
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Tailored Resume
        </p>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-cream/60 p-3 text-[11px] leading-relaxed text-ink">
          {markdown || "(Resume content unavailable — open in jobseek.fyi)"}
        </pre>
      </Card>
      <div className="flex flex-col gap-2">
        <Button onClick={onCopy} className="w-full" disabled={!markdown}>
          Copy Markdown
        </Button>
        <Button variant="secondary" onClick={onOpen} className="w-full">
          Open in jobseek.fyi
        </Button>
      </div>
    </div>
  );
}
