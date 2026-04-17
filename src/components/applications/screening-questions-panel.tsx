"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCw, Trash2, Check, Sparkles } from "lucide-react";
import type { Database } from "@/lib/types/database";

type Application = Database["public"]["Tables"]["applications"]["Row"];
type Question = Database["public"]["Tables"]["application_questions"]["Row"];

/**
 * Thin HTTP client so this component can be reused outside the Next.js web app
 * (e.g. the Chrome extension, which uses `authedFetch` with a Bearer token).
 * Default implementation uses window.fetch against same-origin `/api/...`.
 */
export interface ScreeningClient {
  list: (application_id: string) => Promise<Question[]>;
  create: (
    application_id: string,
    questions: Array<Pick<Question, "question_text"> & Partial<Question>>
  ) => Promise<Question[]>;
  generate: (question_id: string) => Promise<Question>;
  update: (id: string, patch: Partial<Question>) => Promise<Question>;
  remove: (id: string) => Promise<void>;
}

export const defaultScreeningClient: ScreeningClient = {
  async list(application_id) {
    const r = await fetch(
      `/api/application-questions?application_id=${encodeURIComponent(application_id)}`
    );
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();
    return j.questions ?? [];
  },
  async create(application_id, questions) {
    const r = await fetch("/api/application-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_id, questions }),
    });
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();
    return j.questions ?? [];
  },
  async generate(question_id) {
    const r = await fetch("/api/application-questions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id }),
    });
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();
    return j.question;
  },
  async update(id, patch) {
    const r = await fetch("/api/application-questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();
    return j.question;
  },
  async remove(id) {
    const r = await fetch(
      `/api/application-questions?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    if (!r.ok) throw new Error(await r.text());
  },
};

function splitIntoQuestions(raw: string): string[] {
  // Split on blank lines first (paragraph mode), then fall back to newlines.
  const paras = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length > 1) return paras;
  return raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

interface Props {
  application: Application;
  client?: ScreeningClient;
  /** Compact chromeless variant for side-panel / generate page. */
  variant?: "full" | "compact";
}

export function ScreeningQuestionsPanel({
  application,
  client = defaultScreeningClient,
  variant = "full",
}: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [inputLength, setInputLength] =
    useState<Question["answer_length"]>("medium");
  const [adding, setAdding] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setQuestions(await client.list(application.id));
    } finally {
      setLoading(false);
    }
  }, [application.id, client]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    const items = splitIntoQuestions(input);
    if (items.length === 0) return;
    setAdding(true);
    try {
      const created = await client.create(
        application.id,
        items.map((t) => ({ question_text: t, answer_length: inputLength }))
      );
      setQuestions((prev) => [...prev, ...created]);
      setInput("");
      // Auto-generate for all newly added
      for (const q of created) {
        await runGenerate(q.id);
      }
    } catch (e) {
      console.error(e);
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(false);
    }
  }

  async function runGenerate(qid: string) {
    setGeneratingId(qid);
    try {
      const updated = await client.generate(qid);
      setQuestions((prev) => prev.map((q) => (q.id === qid ? updated : q)));
    } catch (e) {
      console.error(e);
      alert(`Generate failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleCopy(q: Question) {
    if (!q.answer_text) return;
    await navigator.clipboard.writeText(q.answer_text);
    setCopiedId(q.id);
    setTimeout(() => setCopiedId((cur) => (cur === q.id ? null : cur)), 1500);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question and its answer?")) return;
    await client.remove(id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function handleEditAnswer(id: string, answer_text: string) {
    const updated = await client.update(id, { answer_text });
    setQuestions((prev) => prev.map((q) => (q.id === id ? updated : q)));
  }

  async function handleChangeLength(
    id: string,
    answer_length: Question["answer_length"]
  ) {
    const updated = await client.update(id, { answer_length });
    setQuestions((prev) => prev.map((q) => (q.id === id ? updated : q)));
  }

  const inner = (
    <>
      {/* Input */}
      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            "Paste one or more screening questions. Separate with a blank line.\n\nExample:\nDescribe a SaaS product strategy you developed and executed. What market insights informed it?\n\nDescribe a SaaS product where you incorporated AI capabilities."
          }
          className="min-h-[110px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">
            Answer length
          </label>
          <Select
            value={inputLength}
            onChange={(e) =>
              setInputLength(e.target.value as Question["answer_length"])
            }
            className="h-8 text-xs"
          >
            <option value="short">Short (~75w)</option>
            <option value="medium">Medium (~125w)</option>
            <option value="long">Long (~220w)</option>
          </Select>
          <div className="flex-1" />
          <Button
            onClick={handleAdd}
            disabled={adding || !input.trim()}
            size="sm"
            className="gap-1.5"
          >
            <Sparkles size={14} />
            {adding ? "Generating…" : "Add + generate"}
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {loading && (
          <div className="text-xs text-[var(--text-muted)]">Loading…</div>
        )}
        {!loading && questions.length === 0 && (
          <div className="rounded-md border border-dashed border-[var(--border-subtle)] p-6 text-center text-xs text-[var(--text-muted)]">
            No questions yet. Paste above to get started.
          </div>
        )}
        {questions.map((q) => {
          const isGen = generatingId === q.id;
          return (
            <div
              key={q.id}
              className="rounded-md border border-[var(--border-subtle)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm font-medium text-[var(--text-primary)]">
                  {q.question_text}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  className="shrink-0 rounded-md p-1 text-[var(--text-faint)] hover:text-[var(--red-muted)]"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  value={q.answer_length}
                  onChange={(e) =>
                    handleChangeLength(
                      q.id,
                      e.target.value as Question["answer_length"]
                    )
                  }
                  className="h-7 text-xs"
                >
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => runGenerate(q.id)}
                  disabled={isGen}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <RefreshCw
                    size={12}
                    className={isGen ? "animate-spin" : ""}
                  />
                  {q.answer_text ? "Regenerate" : "Generate"}
                </Button>
                {q.answer_text && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(q)}
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    {copiedId === q.id ? (
                      <>
                        <Check size={12} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy
                      </>
                    )}
                  </Button>
                )}
                {q.confidence !== null && q.confidence !== undefined && (
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                    conf {Math.round(q.confidence * 100)}%
                  </span>
                )}
              </div>

              {(q.answer_text || isGen) && (
                <EditableAnswer
                  value={q.answer_text ?? ""}
                  loading={isGen}
                  onSave={(v) => handleEditAnswer(q.id, v)}
                />
              )}

              {q.gaps && q.gaps.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                    missing
                  </span>
                  {q.gaps.map((g, i) => (
                    <Badge key={i} variant="none" className="text-[10px]">
                      {g}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  if (variant === "compact") return <div>{inner}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Screening Questions</CardTitle>
      </CardHeader>
      <CardContent>{inner}</CardContent>
    </Card>
  );
}

function EditableAnswer({
  value,
  loading,
  onSave,
}: {
  value: string;
  loading: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (loading) {
    return (
      <div className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-muted,transparent)] p-2 text-xs text-[var(--text-muted)]">
        Generating answer…
      </div>
    );
  }

  if (!editing) {
    return (
      <div
        className="mt-2 cursor-text whitespace-pre-wrap rounded-md border border-[var(--border-subtle)] p-2 text-sm"
        onClick={() => setEditing(true)}
        role="textbox"
        tabIndex={0}
      >
        {value}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-[100px] text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="h-7 px-2 text-xs"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          className="h-7 px-2 text-xs"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
