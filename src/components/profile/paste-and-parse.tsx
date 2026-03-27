"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardPaste } from "lucide-react";
import { showSnackbar } from "@/components/ui/snackbar";

interface Props {
  onComplete: () => void;
}

export function PasteAndParse({ onComplete }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleParse() {
    if (!text.trim() || !user) return;
    setSubmitting(true);

    try {
      const label = title.trim() || `Pasted content — ${new Date().toLocaleDateString()}`;

      // Create a document record
      const { data: docRecord, error: dbError } = await supabase
        .from("uploaded_documents")
        .insert({
          user_id: user.id,
          file_name: label,
          file_path: `pasted/${user.id}/${Date.now()}`,
          file_type: "text/plain",
          document_type: "other",
          processing_status: "processing",
        })
        .select("id")
        .single();

      if (dbError) throw dbError;

      // Close form immediately and show progress snackbar
      setTitle("");
      setText("");
      showSnackbar(`Processing "${label}"...`, "info");
      onComplete();

      // Fire in background
      const res = await fetch("/api/process-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          pasted_text: text,
          document_id: docRecord?.id,
        }),
      });

      if (!res.ok) throw new Error("Processing failed");

      showSnackbar(`"${label}" parsed — profile updated`);
      onComplete(); // Refresh data again after processing completes
    } catch (err) {
      console.error("Parse failed:", err);
      showSnackbar("Failed to parse content", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold">Paste & Parse</h3>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Paste a resume, project write-up, performance review, or any career document.
        The AI will extract and structure it automatically.
      </p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Label (e.g. 'Google PM Resume', 'Project write-up')"
        className="mb-3 border-[var(--border-input)] bg-[var(--bg-card)] text-sm placeholder:text-[var(--text-faint)]"
      />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your document content here..."
        rows={10}
        className="mb-4 border-[var(--border-input)] bg-[var(--bg-card)] text-sm placeholder:text-[var(--text-faint)]"
      />
      <Button
        onClick={handleParse}
        disabled={!text.trim() || submitting}
        className="w-full"
      >
        <ClipboardPaste className="mr-2 h-4 w-4" />
        Parse & Add to Profile
      </Button>
    </div>
  );
}
