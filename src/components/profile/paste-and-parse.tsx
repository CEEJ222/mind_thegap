"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ClipboardPaste } from "lucide-react";
import { showSnackbar } from "@/components/ui/snackbar";

interface Props {
  onComplete: () => void;
}

export function PasteAndParse({ onComplete }: Props) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);

  async function handleParse() {
    if (!text.trim() || !user) return;
    setParsing(true);

    try {
      const res = await fetch("/api/process-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          pasted_text: text,
        }),
      });

      if (!res.ok) throw new Error("Processing failed");

      setText("");
      showSnackbar("Content parsed — profile updated");
      onComplete();
    } catch (err) {
      console.error("Parse failed:", err);
      showSnackbar("Failed to parse content", "error");
    } finally {
      setParsing(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold">Paste & Parse</h3>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Paste a resume, job description, performance review, or any career document.
        The AI will extract and structure it automatically.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your document content here..."
        rows={10}
        className="mb-4 border-[var(--border-input)] bg-[var(--bg-card)] text-sm placeholder:text-[var(--text-faint)]"
      />
      <Button
        onClick={handleParse}
        disabled={!text.trim() || parsing}
        className="w-full"
      >
        {parsing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Parsing...
          </>
        ) : (
          <>
            <ClipboardPaste className="mr-2 h-4 w-4" />
            Parse & Add to Profile
          </>
        )}
      </Button>
    </div>
  );
}
