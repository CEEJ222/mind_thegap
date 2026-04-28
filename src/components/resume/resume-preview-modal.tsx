"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2 } from "lucide-react";

interface Props {
  resumeId: string;
  onClose: () => void;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let firstLine = true;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (firstLine && line.includes("|")) {
      firstLine = false;
      const parts = line.split("|").map((p) => p.trim());
      // Strip Markdown heading markers if the model used "# Name | …" on one line
      const name = (parts[0] || "").replace(/^#+\s*/, "").trim();
      const rest = parts.slice(1).filter(Boolean).join("  ·  ");
      html.push(
        `<div class="resume-header"><div class="resume-name">${esc(name)}</div><div class="resume-contact">${esc(rest)}</div></div>`
      );
      continue;
    }
    firstLine = false;

    if (!line) {
      html.push(`<div class="resume-spacer"></div>`);
      continue;
    }

    if (line.startsWith("### ")) {
      html.push(`<div class="resume-role">${esc(line.slice(4))}</div>`);
      continue;
    }

    if (line.startsWith("## ") || line.startsWith("# ")) {
      const text = line.replace(/^#{1,2}\s+/, "");
      html.push(`<div class="resume-section">${esc(text)}</div>`);
      continue;
    }

    if (/^[-*•]\s/.test(line)) {
      const text = line.replace(/^[-*•]\s+/, "");
      html.push(`<div class="resume-bullet">• ${renderInline(text)}</div>`);
      continue;
    }

    if (line.includes("|") && !line.startsWith("#")) {
      html.push(`<div class="resume-role">${esc(line.replace(/\*\*/g, ""))}</div>`);
      continue;
    }

    html.push(`<div class="resume-text">${renderInline(line)}</div>`);
  }

  return html.join("");
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  // **bold**
  const escaped = esc(text);
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function ResumePreviewModal({ resumeId, onClose }: Props) {
  const supabase = createClient();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data, error: dbErr } = await supabase
          .from("generated_resumes")
          .select("editorial_notes, file_path")
          .eq("id", resumeId)
          .single();

        if (dbErr || !data) throw new Error("Resume not found");

        let notes = data.editorial_notes as Record<string, unknown> | string | null;
        if (typeof notes === "string") {
          try { notes = JSON.parse(notes); } catch { notes = null; }
        }

        const md = (notes as Record<string, unknown> | null)?.resume_content as string | undefined;

        if (md) {
          setContent(md);
        } else if (data.file_path) {
          // Fallback: download from storage
          const { data: fileData } = await supabase.storage
            .from("resumes")
            .download(data.file_path);
          if (fileData) {
            setContent(await fileData.text());
          } else {
            throw new Error("Could not load resume content");
          }
        } else {
          throw new Error("No resume content available");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load resume");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-full max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">Resume Preview</span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}
          {error && (
            <p className="text-center text-sm text-red-500 py-20">{error}</p>
          )}
          {content && (
            <>
              <style>{`
                .resume-header { text-align: center; margin-bottom: 16px; }
                .resume-name { font-size: 22px; font-weight: 700; color: #1c1c1e; font-family: Calibri, Georgia, serif; }
                .resume-contact { font-size: 12px; color: #666; margin-top: 4px; font-family: Calibri, Georgia, serif; }
                .resume-section {
                  font-size: 13px; font-weight: 700; color: #1F4E79;
                  text-transform: uppercase; letter-spacing: 0.05em;
                  border-bottom: 1px solid #1F4E79;
                  padding-bottom: 3px; margin-top: 18px; margin-bottom: 8px;
                  font-family: Calibri, Georgia, serif;
                }
                .resume-role {
                  font-size: 13px; font-weight: 600; color: #1F4E79;
                  margin-top: 10px; margin-bottom: 3px;
                  font-family: Calibri, Georgia, serif;
                }
                .resume-bullet {
                  font-size: 12px; color: #1c1c1e; margin-left: 12px; margin-bottom: 2px;
                  line-height: 1.5; font-family: Calibri, Georgia, serif;
                }
                .resume-text {
                  font-size: 12px; color: #1c1c1e; line-height: 1.5; margin-bottom: 3px;
                  font-family: Calibri, Georgia, serif;
                }
                .resume-spacer { height: 6px; }
              `}</style>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
