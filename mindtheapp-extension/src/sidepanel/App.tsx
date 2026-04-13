import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/ui/badge";
import {
  analyzeJob,
  ApiError,
  exportResumeDocx,
  generateResume,
  getApplicationDeepLink,
  getAutofillProfile,
  getProfile,
  getProfileDeepLink,
  getSavedJobsDeepLink,
  getSettingsDeepLink,
  saveJob,
} from "@/lib/api";
import type {
  AnalyzeResponse,
  ApplyFormSignal,
  AutofillResult,
  ContentScriptMessage,
  GenerateResumeResponse,
  GetAuthStateResponse,
  GetCurrentFormResponse,
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
  { label: "Ashby", color: "#F0A6CA" },
  { label: "Rippling", color: "#FFAE00" },
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
  | { kind: "applied" }
  | { kind: "error"; message: string };

type AutofillState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: AutofillResult }
  | { kind: "error"; message: string };

export default function App(): React.ReactElement {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [form, setForm] = useState<ApplyFormSignal | null>(null);
  const [autofill, setAutofill] = useState<AutofillState>({ kind: "idle" });

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

    const [jdResp, formResp] = await Promise.all([
      sendBgMessage<GetCurrentJdResponse>({ type: "GET_CURRENT_JD" }),
      sendBgMessage<GetCurrentFormResponse>({ type: "GET_CURRENT_FORM" }),
    ]);
    setForm(formResp?.form ?? null);
    if (jdResp?.jd) {
      setView({ kind: "jd-detected", profile, jd: jdResp.jd });
    } else {
      setView({ kind: "authenticated-no-jd", profile });
    }
  }, []);

  /**
   * Lighter-weight refresh used when the user just switched tabs. We
   * pull the cached JD + form for the now-active tab but PRESERVE
   * in-flight states (analyzing/generating) and the results/resume-ready
   * views — the user may have been mid-flow on tab A, popped over to
   * tab B, and we don't want to nuke their analysis just because they
   * looked at a calendar.
   */
  const refreshForActiveTab = useCallback(async () => {
    const [jdResp, formResp] = await Promise.all([
      sendBgMessage<GetCurrentJdResponse>({ type: "GET_CURRENT_JD" }),
      sendBgMessage<GetCurrentFormResponse>({ type: "GET_CURRENT_FORM" }),
    ]);
    const incomingForm = formResp?.form ?? null;
    setForm((prevForm) => {
      const sameUrl =
        prevForm && incomingForm && prevForm.pageUrl === incomingForm.pageUrl;
      if (!sameUrl) {
        // Different tab / different URL → reset transient per-job state.
        setSaveState((prev) => (prev.kind === "applied" ? prev : { kind: "idle" }));
        setAutofill((prev) => (prev.kind === "running" ? prev : { kind: "idle" }));
      }
      return incomingForm;
    });
    setView((prev) => {
      if (
        prev.kind === "authenticated-no-jd" ||
        prev.kind === "jd-detected"
      ) {
        if (jdResp?.jd) {
          return { kind: "jd-detected", profile: prev.profile, jd: jdResp.jd };
        }
        return { kind: "authenticated-no-jd", profile: prev.profile };
      }
      return prev;
    });
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
      // Content script detected a post-apply confirmation page on a
      // supported ATS. Flip the side panel to the "Applied" state.
      if (msg && (msg as { type?: string }).type === "JOB_STATUS_UPDATED") {
        const payload = msg as { type: string; status?: string };
        if (payload.status === "applied") {
          setSaveState({ kind: "applied" });
        }
      }
      if (msg && (msg as { type?: string }).type === "FORM_UPDATED") {
        const payload = msg as { type: string; payload?: ApplyFormSignal };
        if (payload.payload) {
          const incoming = payload.payload;
          setForm((prev) => {
            // Only reset autofill state when the user has navigated to
            // a different posting. If it's the same URL (just a DOM
            // mutation — which our own autofill writes trigger!), keep
            // whatever state the flow was in.
            if (!prev || prev.pageUrl !== incoming.pageUrl) {
              setAutofill({ kind: "idle" });
            }
            return incoming;
          });
        }
      }
      if (msg && (msg as { type?: string }).type === "FORM_CLEARED") {
        setForm(null);
        // Don't reset autofill state if the flow is in-flight — a
        // mid-fill DOM mutation can transiently clear the form signal.
        setAutofill((prev) => (prev.kind === "running" ? prev : { kind: "idle" }));
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    // Re-hydrate when the user switches tabs or navigates to a new URL on
    // the active tab — the cached JD/form state in the background is
    // tab-keyed, so we need to refetch whenever the focused tab changes.
    const onTabActivated = (_info: chrome.tabs.TabActiveInfo) => {
      void refreshForActiveTab();
    };
    const onTabUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (!tab.active) return;
      if (changeInfo.url || changeInfo.status === "complete") {
        void refreshForActiveTab();
      }
    };
    chrome.tabs.onActivated.addListener(onTabActivated);
    chrome.tabs.onUpdated.addListener(onTabUpdated);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.tabs.onActivated.removeListener(onTabActivated);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    };
  }, [hydrate, refreshForActiveTab]);

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

  const onAutofill = async () => {
    console.debug("[mindtheapp] autofill click");
    setAutofill({ kind: "running" });
    try {
      console.debug("[mindtheapp] fetching profile");
      const profile = await getAutofillProfile();
      console.debug("[mindtheapp] profile", profile);

      // Side panels live in a persistent Chrome UI surface. The active
      // browser tab (the apply form) is what we want — query lastFocusedWindow
      // to skip past any fullscreen/devtools windows that might confuse
      // currentWindow resolution.
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      console.debug("[mindtheapp] target tab", tab?.id, tab?.url);
      if (!tab?.id) {
        setAutofill({
          kind: "error",
          message: "No active tab — reopen the side panel on the apply form.",
        });
        return;
      }
      const msg: ContentScriptMessage = { type: "AUTOFILL", profile };
      let resp: { ok?: boolean; result?: AutofillResult; error?: string } | null =
        null;
      try {
        resp = await chrome.tabs.sendMessage(tab.id, msg);
      } catch (err) {
        console.warn("[mindtheapp] sendMessage threw", err);
        resp = null;
      }
      console.debug("[mindtheapp] content script response", resp);
      if (!resp || resp.ok !== true) {
        setAutofill({
          kind: "error",
          message:
            resp?.error ??
            "Content script didn't respond — reload the apply form tab and try again.",
        });
        return;
      }
      setAutofill({ kind: "done", result: resp.result as AutofillResult });
    } catch (err) {
      console.error("[mindtheapp] autofill failed", err);
      if (err instanceof ApiError && err.status === 401) {
        setView({ kind: "unauthenticated" });
        return;
      }
      setAutofill({
        kind: "error",
        message: err instanceof Error ? err.message : "Autofill failed",
      });
    }
  };

  const onOpenSettings = () => {
    void chrome.tabs.create({ url: getSettingsDeepLink() });
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
    <div className="flex h-full flex-col bg-panel-bg p-5">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md bg-turquoise text-turquoise-ink"
            aria-hidden
          >
            <span className="text-lg font-bold">M</span>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight text-panel-text">Mind the App</h1>
            <p className="text-[11px] text-panel-text-muted">by jobseek.fyi</p>
          </div>
        </div>
        {view.kind !== "unauthenticated" && view.kind !== "loading" ? (
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="text-xs text-panel-text-muted hover:text-panel-text transition-colors"
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

        {/* Autofill card appears on any authenticated view when the content
             script detected an apply-form on the current page. Positioned
             above the JD / results / resume-ready views because it's the
             most time-sensitive action. */}
        {form &&
          view.kind !== "loading" &&
          view.kind !== "unauthenticated" &&
          view.kind !== "no-profile" && (
            <AutofillCard
              form={form}
              state={autofill}
              onAutofill={() => void onAutofill()}
              onOpenSettings={onOpenSettings}
            />
          )}

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
            analysis={view.analysis}
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
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-panel-border border-t-turquoise" />
      <p className="text-sm text-panel-text-muted">{label}</p>
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
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-turquoise shadow-[0_8px_20px_rgba(61,217,179,0.3)]">
        <span className="text-3xl font-bold text-turquoise-ink">M</span>
      </div>
      <div>
        <h2 className="text-lg font-bold text-panel-text">Welcome to Mind the App</h2>
        <p className="mt-1 text-sm text-panel-text-muted">
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
        <h2 className="text-sm font-bold text-panel-text">Add your profile first</h2>
        <p className="mt-1 text-xs text-panel-text-muted">
          We need your experience, projects, and skills before we can
          analyze a job posting or generate a tailored resume.
        </p>
      </div>
      <Button onClick={onOpenProfile} className="mt-2 w-full">
        Open profile on jobseek.fyi ↗
      </Button>
      <p className="text-[11px] text-panel-text-faint">
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
        <h2 className="text-sm font-bold text-panel-text">Navigate to a job posting</h2>
        <p className="mt-1 text-xs text-panel-text-muted">
          Open any supported ATS and we&apos;ll detect the description
          automatically.
        </p>
      </div>
      <div className="mt-2 grid w-full grid-cols-2 gap-2">
        {SUPPORTED_ATS.map((a) => (
          <div
            key={a.label}
            className="rounded-md border border-panel-border bg-panel-surface px-3 py-2 text-center text-xs font-semibold text-panel-text"
          >
            <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: a.color }} />
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-turquoise">
          {jd.atsType}
        </p>
        <h2 className="mt-1 text-base font-bold leading-snug text-panel-text">
          {jd.jobTitle || "Untitled role"}
        </h2>
        {jd.company ? (
          <p className="mt-0.5 text-sm text-panel-text-muted">{jd.company}</p>
        ) : null}
        <p className="mt-3 line-clamp-5 text-xs text-panel-text-muted">
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
  if (saveState.kind === "applied") {
    return (
      <div className="flex items-center justify-between rounded-md border border-turquoise/40 bg-turquoise/10 px-3 py-2 text-xs">
        <span className="flex items-center gap-2 font-semibold text-turquoise">
          <span
            className="inline-block h-2 w-2 rounded-full bg-turquoise"
            aria-hidden
          />
          Applied — status updated
        </span>
        <button
          type="button"
          onClick={onOpenSavedJobs}
          className="text-turquoise underline-offset-2 hover:underline"
        >
          Applications →
        </button>
      </div>
    );
  }

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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-panel-text-muted">
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
        <p className="mt-0.5 text-xs text-panel-text-muted">
          {analysis.job_title}
          {analysis.company_name ? ` · ${analysis.company_name}` : ""}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-panel-text-muted">
          Themes
        </p>
        {orderedThemes.map((t) => (
          <div
            key={t.id}
            className="rounded-md border border-panel-border bg-panel-surface px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-panel-text">{t.theme_name}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-panel-text-muted">
                  {t.score_numeric}
                </span>
                <TierBadge tier={t.score_tier} />
              </div>
            </div>
            {t.explanation ? (
              <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-panel-text-muted">
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
  analysis,
  onCopy,
  onOpen,
}: {
  resume: GenerateResumeResponse;
  analysis: AnalyzeResponse;
  onCopy: () => void;
  onOpen: () => void;
}): React.ReactElement {
  const markdown = resume.editorial_notes?.resume_content ?? "";
  const filename = useMemo(() => {
    const companyPart = analysis.company_name
      ? analysis.company_name.replace(/\s+/g, "_")
      : "Resume";
    const titlePart = analysis.job_title
      ? analysis.job_title.replace(/\s+/g, "_")
      : "role";
    return `${companyPart}_${titlePart}`;
  }, [analysis.company_name, analysis.job_title]);

  // Pre-fetch the DOCX once the resume is ready so Download + Drag are
  // instant. Revoke the blob URL on unmount to free memory.
  const [docx, setDocx] = useState<
    | { status: "loading" }
    | { status: "ready"; blob: Blob; url: string }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    if (!resume.file_path) {
      setDocx({ status: "error", message: "No file path on resume" });
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const { blob } = await exportResumeDocx({
          filePath: resume.file_path,
          fileName: filename,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        createdUrl = url;
        setDocx({ status: "ready", blob, url });
      } catch (err) {
        if (cancelled) return;
        setDocx({
          status: "error",
          message: err instanceof Error ? err.message : "Export failed",
        });
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [resume.file_path, filename]);

  const onDownload = () => {
    if (docx.status !== "ready") return;
    const a = document.createElement("a");
    a.href = docx.url;
    a.download = `${filename}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex flex-col gap-4">
      {markdown ? (
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-panel-text-muted">
              Tailored Resume
            </p>
            <button
              type="button"
              onClick={onOpen}
              className="text-[11px] font-semibold text-turquoise underline-offset-2 hover:underline"
            >
              Full preview →
            </button>
          </div>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-panel-border bg-panel-bg p-3 text-[11px] leading-relaxed text-panel-text">
            {markdown}
          </pre>
        </Card>
      ) : (
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-panel-text-muted">
            Tailored Resume
          </p>
          <p className="mt-2 text-xs text-panel-text-muted">
            Preview your resume on jobseek.fyi — or download the DOCX below.
          </p>
          <div className="mt-3">
            <Button onClick={onOpen} variant="secondary" className="w-full">
              Preview on jobseek.fyi ↗
            </Button>
          </div>
        </Card>
      )}

      {docx.status === "ready" && (
        <DocxDragChip blob={docx.blob} filename={`${filename}.docx`} />
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={onDownload}
          className="w-full"
          disabled={docx.status !== "ready"}
        >
          {docx.status === "loading"
            ? "Preparing DOCX…"
            : docx.status === "error"
              ? "DOCX unavailable"
              : "Download DOCX"}
        </Button>
        {markdown ? (
          <Button onClick={onCopy} variant="secondary" className="w-full">
            Copy Markdown
          </Button>
        ) : null}
        {markdown ? (
          <Button variant="ghost" onClick={onOpen} className="w-full">
            View application in jobseek.fyi
          </Button>
        ) : null}
      </div>

      {docx.status === "error" && (
        <p className="text-[11px] text-tier-none">{docx.message}</p>
      )}
    </div>
  );
}

function AutofillCard({
  form,
  state,
  onAutofill,
  onOpenSettings,
}: {
  form: ApplyFormSignal;
  state: AutofillState;
  onAutofill: () => void;
  onOpenSettings: () => void;
}): React.ReactElement {
  return (
    <div className="mb-4 rounded-lg border border-turquoise/40 bg-turquoise/10 p-3 shadow-panel">
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-turquoise text-turquoise-ink"
          aria-hidden
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 5h12M4 10h12M4 15h8" />
            <path d="M15 14l2 2 4-4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-turquoise">
            Apply form detected
          </p>
          <p className="mt-0.5 text-xs text-panel-text">
            {form.candidateCount} field{form.candidateCount === 1 ? "" : "s"} we
            can autofill from your profile.
          </p>
        </div>
      </div>

      {state.kind === "done" ? (
        <AutofillResultRow
          result={state.result}
          onRetry={onAutofill}
          onOpenSettings={onOpenSettings}
        />
      ) : state.kind === "error" ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button onClick={onAutofill} className="w-full">
            Try autofill again
          </Button>
          <p className="text-[11px] text-tier-none">{state.message}</p>
        </div>
      ) : (
        <Button
          onClick={onAutofill}
          disabled={state.kind === "running"}
          className="mt-3 w-full"
        >
          {state.kind === "running" ? "Filling…" : "Autofill form"}
        </Button>
      )}
    </div>
  );
}

function AutofillResultRow({
  result,
  onRetry,
  onOpenSettings,
}: {
  result: AutofillResult;
  onRetry: () => void;
  onOpenSettings: () => void;
}): React.ReactElement {
  const missing = result.fields.filter((f) => !f.filled);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="rounded-md border border-panel-border bg-panel-surface px-3 py-2 text-xs">
        <p className="font-semibold text-panel-text">
          ✓ Filled {result.filled} field{result.filled === 1 ? "" : "s"}
          {result.skipped > 0
            ? ` · skipped ${result.skipped}`
            : ""}
        </p>
        {missing.length > 0 ? (
          <p className="mt-1 text-[11px] text-panel-text-muted">
            Missing or pre-filled: {missing.map((f) => f.label).join(", ")}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onRetry} className="flex-1">
          Re-run
        </Button>
        <Button variant="ghost" onClick={onOpenSettings} className="flex-1">
          Edit profile
        </Button>
      </div>
    </div>
  );
}

/**
 * Draggable chip that initiates a File-typed HTML5 drag. Dragging onto an
 * ATS file-upload input (most React forms listen for the `drop` event on
 * input[type=file]) attaches the DOCX directly without hitting the
 * filesystem.
 */
function DocxDragChip({
  blob,
  filename,
}: {
  blob: Blob;
  filename: string;
}): React.ReactElement {
  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const file = new File([blob], filename, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    try {
      e.dataTransfer.items.add(file);
    } catch {
      /* some browsers restrict items.add cross-origin; ignore */
    }
    // Also set DownloadURL so dragging onto the desktop still produces a file.
    e.dataTransfer.setData(
      "DownloadURL",
      `${file.type}:${filename}:${URL.createObjectURL(blob)}`,
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group flex cursor-grab items-center gap-3 rounded-md border border-turquoise/40 bg-turquoise/10 px-3 py-2 active:cursor-grabbing hover:border-turquoise/70 hover:bg-turquoise/15 transition-colors"
      role="button"
      aria-label="Drag resume to upload field"
      title="Drag onto an upload field or the desktop"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-turquoise text-turquoise-ink">
        <span className="text-[10px] font-bold">DOCX</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-panel-text">
          {filename}
        </p>
        <p className="text-[11px] text-panel-text-muted">
          Drag onto an upload field →
        </p>
      </div>
    </div>
  );
}
