"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileText } from "lucide-react";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function handleUpload() {
    if (!selectedFile || !user) return;
    setUploading(true);

    try {
      const filePath = `${user.id}/${Date.now()}_${selectedFile.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Create tracking record
      const { error: dbError } = await supabase
        .from("uploaded_documents")
        .insert({
          user_id: user.id,
          file_name: selectedFile.name,
          file_path: filePath,
          file_type: selectedFile.type,
          processing_status: "pending",
        });

      if (dbError) throw dbError;

      // Trigger background processing
      await fetch("/api/process-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          file_path: filePath,
          file_name: selectedFile.name,
        }),
      });

      setSelectedFile(null);
      onComplete();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold">Upload Document</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Supported formats: PDF, DOCX, plain text. Accepts resumes, project
        write-ups, biz cases, awards, certifications, and performance reviews.
      </p>

      <div
        className="mb-4 cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center hover:border-accent"
        onClick={() => fileRef.current?.click()}
      >
        {selectedFile ? (
          <div className="flex items-center justify-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            <span>{selectedFile.name}</span>
          </div>
        ) : (
          <div>
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Click to select a file
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
      />

      <Button
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
        className="w-full"
      >
        {uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          "Upload"
        )}
      </Button>
    </div>
  );
}
