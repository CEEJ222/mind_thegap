"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileText, X } from "lucide-react";

interface Props {
  onComplete: () => void;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export function UploadDocuments({ onComplete }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setSelectedFiles((prev) => [...prev, ...files]);
    // Reset input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (selectedFiles.length === 0 || !user) return;
    setUploading(true);
    setProgress(0);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const filePath = `${user.id}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: docRecord, error: dbError } = await supabase
          .from("uploaded_documents")
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            processing_status: "pending",
          })
          .select("id")
          .single();

        if (dbError) throw dbError;

        // Fire and forget — processing happens in background
        fetch("/api/process-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            file_path: filePath,
            file_name: file.name,
            document_id: docRecord?.id,
          }),
        });

        setProgress(i + 1);
      }

      setSelectedFiles([]);
      onComplete();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold">Upload Documents</h3>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Supported formats: PDF, DOCX, plain text. Select multiple files at once
        or add them one by one.
      </p>

      <div
        className="mb-4 cursor-pointer rounded-lg border-2 border-dashed border-[var(--border-input)] p-8 text-center hover:border-[var(--accent)]"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="mx-auto mb-2 h-8 w-8 text-[var(--text-faint)]" />
        <p className="text-sm text-[var(--text-muted)]">
          Click to select files
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        onChange={handleFileSelect}
      />

      {selectedFiles.length > 0 && (
        <div className="mb-4 space-y-2">
          {selectedFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-sm">{file.name}</span>
              </div>
              <button
                onClick={() => removeFile(i)}
                className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--red-muted)]"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={handleUpload}
        disabled={selectedFiles.length === 0 || uploading}
        className="w-full"
      >
        {uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading {progress}/{selectedFiles.length}...
          </>
        ) : (
          `Upload ${selectedFiles.length === 0 ? "" : selectedFiles.length + " "}file${selectedFiles.length !== 1 ? "s" : ""}`
        )}
      </Button>
    </div>
  );
}
