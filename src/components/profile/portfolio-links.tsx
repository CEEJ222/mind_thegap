"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { showSnackbar } from "@/components/ui/snackbar";
import { Laptop, ExternalLink, Pencil } from "lucide-react";

function LinkedInTile() {
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#0A66C2] text-[13px] font-bold text-white">
      in
    </div>
  );
}

function GitHubTile() {
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#181717]">
      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    </div>
  );
}

/** Short display for a URL (hostname + path), or em dash when empty. */
export function displayUrl(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "—";
  try {
    const u = t.startsWith("http") ? new URL(t) : new URL(`https://${t}`);
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "") || t;
  } catch {
    return t.length > 40 ? `${t.slice(0, 37)}…` : t;
  }
}

function hrefFor(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export type PortfolioLinksSaveValues = {
  linkedin: string;
  github: string;
  portfolio: string;
};

export type PortfolioLinksPreviewProps = {
  linkedin: string | null | undefined;
  github: string | null | undefined;
  portfolio: string | null | undefined;
  className?: string;
  /** Show “open” affordance when a URL is set (view mode only) */
  linkRows?: boolean;
  /** Show pencil; inline edit calls onSave */
  editable?: boolean;
  onSave?: (values: PortfolioLinksSaveValues) => Promise<void>;
};

/** Grid of portfolio URLs; optional pencil for inline edit. */
export function PortfolioLinksPreview({
  linkedin,
  github,
  portfolio,
  className = "",
  linkRows = false,
  editable = false,
  onSave,
}: PortfolioLinksPreviewProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftL, setDraftL] = useState(String(linkedin ?? ""));
  const [draftG, setDraftG] = useState(String(github ?? ""));
  const [draftP, setDraftP] = useState(String(portfolio ?? ""));
  const editSnapshot = useRef({ l: "", g: "", p: "" });

  useEffect(() => {
    if (editing) return;
    setDraftL(String(linkedin ?? ""));
    setDraftG(String(github ?? ""));
    setDraftP(String(portfolio ?? ""));
  }, [linkedin, github, portfolio, editing]);

  const rows: {
    key: string;
    label: string;
    raw: string | null | undefined;
    emptyHint: string;
    icon: ReactNode;
  }[] = [
    {
      key: "li",
      label: "LinkedIn URL",
      raw: linkedin,
      emptyHint: "Add your LinkedIn profile URL",
      icon: <LinkedInTile />,
    },
    {
      key: "gh",
      label: "GitHub URL",
      raw: github,
      emptyHint: "Add your GitHub profile URL",
      icon: <GitHubTile />,
    },
    {
      key: "pf",
      label: "Portfolio URL",
      raw: portfolio,
      emptyHint: "Add your portfolio site URL",
      icon: (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#e8d5f2] text-[#5b21b6]">
          <Laptop className="h-5 w-5" strokeWidth={1.75} />
        </div>
      ),
    },
  ];

  const allLinksEmpty =
    !(linkedin ?? "").trim() && !(github ?? "").trim() && !(portfolio ?? "").trim();

  const canEdit = Boolean(editable && onSave);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({ linkedin: draftL, github: draftG, portfolio: draftP });
      setEditing(false);
    } catch (e) {
      const msg =
        e instanceof Error && e.message === "Settings not loaded yet"
          ? e.message
          : "Could not save links";
      showSnackbar(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    editSnapshot.current = {
      l: String(linkedin ?? ""),
      g: String(github ?? ""),
      p: String(portfolio ?? ""),
    };
    setDraftL(String(linkedin ?? ""));
    setDraftG(String(github ?? ""));
    setDraftP(String(portfolio ?? ""));
    setEditing(true);
  }

  function cancelEdit() {
    const s = editSnapshot.current;
    setDraftL(s.l);
    setDraftG(s.g);
    setDraftP(s.p);
    setEditing(false);
  }

  return (
    <div
      className={`rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Portfolio &amp; Links</h2>
        {canEdit && (
          <>
            {!editing ? (
              <button
                type="button"
                onClick={startEdit}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
                aria-label="Edit portfolio links"
              >
                <Pencil size={14} />
              </button>
            ) : (
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-dark)] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {editing && canEdit ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">LinkedIn URL</label>
            <Input
              type="url"
              value={draftL}
              onChange={(e) => setDraftL(e.target.value)}
              placeholder="https://linkedin.com/in/…"
              className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">GitHub URL</label>
            <Input
              type="url"
              value={draftG}
              onChange={(e) => setDraftG(e.target.value)}
              placeholder="https://github.com/…"
              className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Portfolio URL</label>
            <Input
              type="url"
              value={draftP}
              onChange={(e) => setDraftP(e.target.value)}
              placeholder="https://…"
              className="border-[var(--border-input)] bg-[var(--bg-card)] text-sm"
            />
          </div>
        </div>
      ) : (
        <>
          {allLinksEmpty && canEdit && (
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              No links yet. Use the pencil to add your LinkedIn, GitHub, and portfolio URLs.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {rows.map((row) => {
              const href = hrefFor(row.raw);
              const isRowEmpty = !(row.raw ?? "").trim();
              return (
                <div key={row.key} className="flex items-start gap-3">
                  {row.icon}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">{row.label}</div>
                    <div
                      className={
                        isRowEmpty
                          ? "truncate text-xs italic text-[var(--text-faint)]"
                          : "truncate text-xs text-[var(--text-muted)]"
                      }
                      title={(row.raw ?? "").trim() || row.emptyHint}
                    >
                      {isRowEmpty ? row.emptyHint : displayUrl(row.raw)}
                    </div>
                  </div>
                  {linkRows && href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)]"
                      aria-label={`Open ${row.label}`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Profile sidebar: same URLs as Settings; pencil edits inline. */
export function PortfolioLinks() {
  const { user, settings, refreshSettings } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [rowId, setRowId] = useState<string | null>(null);
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [portfolio, setPortfolio] = useState("");

  useEffect(() => {
    if (!user) return;
    const s = settings as Record<string, unknown> | null;
    if (s?.id) {
      setRowId(String(s.id));
      setLinkedin(String(s.linkedin_url ?? ""));
      setGithub(String(s.github_url ?? ""));
      setPortfolio(String(s.website_url ?? ""));
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .limit(1);
        const row = data?.[0];
        if (row) {
          setRowId(String(row.id));
          setLinkedin(String(row.linkedin_url ?? ""));
          setGithub(String(row.github_url ?? ""));
          setPortfolio(String(row.website_url ?? ""));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, settings, supabase]);

  async function handleSave(values: PortfolioLinksSaveValues) {
    if (!rowId) throw new Error("Settings not loaded yet");
    const { error } = await supabase
      .from("user_settings")
      .update({
        linkedin_url: values.linkedin.trim() || null,
        github_url: values.github.trim() || null,
        website_url: values.portfolio.trim() || null,
      })
      .eq("id", rowId);

    if (error) throw error;
    setLinkedin(values.linkedin);
    setGithub(values.github);
    setPortfolio(values.portfolio);
    await refreshSettings();
    showSnackbar("Portfolio links saved");
  }

  if (loading) {
    return (
      <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="h-24 animate-pulse rounded bg-[var(--bg-overlay)]" />
      </div>
    );
  }

  return (
    <div>
      <PortfolioLinksPreview
        linkedin={linkedin}
        github={github}
        portfolio={portfolio}
        linkRows
        editable
        onSave={handleSave}
      />
    </div>
  );
}
