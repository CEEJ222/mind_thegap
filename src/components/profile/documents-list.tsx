"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import { FileText, ClipboardPaste, Trash2, Loader2, ExternalLink } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  documents: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  urls: any[];
  onUpdate: () => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="strong" className="text-[10px]">Processed</Badge>;
    case "processing":
      return <Badge variant="default" className="text-[10px]">Processing</Badge>;
    case "failed":
      return <Badge variant="none" className="text-[10px]">Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
  }
}

export function DocumentsList({ documents, urls, onUpdate }: Props) {
  const supabase = createClient();
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDeleteDoc(doc: { id: string; file_path: string; user_id: string }) {
    setLoading(true);
    try {
      // Delete related profile entries (chunks cascade via FK)
      await supabase
        .from("profile_entries")
        .delete()
        .eq("source_document_id", doc.id);

      // Delete the file from storage
      await supabase.storage.from("documents").remove([doc.file_path]);

      // Delete the document record
      await supabase.from("uploaded_documents").delete().eq("id", doc.id);

      setDeletingDoc(null);
      showSnackbar("Document deleted");
      onUpdate();
    } catch (err) {
      console.error("Delete failed:", err);
      showSnackbar("Failed to delete document", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUrl(urlId: string) {
    setLoading(true);
    try {
      await supabase.from("scraped_urls").delete().eq("id", urlId);
      setDeletingUrl(null);
      showSnackbar("URL deleted");
      onUpdate();
    } catch (err) {
      console.error("Delete failed:", err);
      showSnackbar("Failed to delete URL", "error");
    } finally {
      setLoading(false);
    }
  }

  if (documents.length === 0 && urls.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
        Uploaded Files & Links
      </h2>

      <div className="space-y-2">
        {/* Documents */}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {doc.file_path?.startsWith("pasted/") ? (
                <ClipboardPaste className="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" />
              ) : (
                <FileText className="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {doc.file_name}
                </div>
                <div className="text-xs text-[var(--text-faint)]">
                  {new Date(doc.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(doc.processing_status)}
              {deletingDoc === doc.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteDoc(doc)}
                    disabled={loading}
                    className="h-7 px-2 text-xs"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeletingDoc(null)}
                    className="h-7 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setDeletingDoc(doc.id)}
                  className="rounded-md p-1.5 text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--red-muted)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* URLs */}
        {urls.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <ExternalLink className="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {u.url}
                </div>
                <div className="text-xs text-[var(--text-faint)]">
                  {u.url_type?.replace("_", " ")} · {new Date(u.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(u.processing_status)}
              {deletingUrl === u.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteUrl(u.id)}
                    disabled={loading}
                    className="h-7 px-2 text-xs"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeletingUrl(null)}
                    className="h-7 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setDeletingUrl(u.id)}
                  className="rounded-md p-1.5 text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--red-muted)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
