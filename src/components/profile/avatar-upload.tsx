"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import { Camera, X } from "lucide-react";

interface Props {
  fullName: string;
  avatarUrl: string | null;
  onUpdate: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function AvatarUpload({ fullName, avatarUrl, onUpdate }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(avatarUrl);

  // Resize image to max 400x400 for crisp rendering
  function resizeImage(file: File, maxSize: number): Promise<Blob> {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
        } else {
          if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    try {
      const resized = await resizeImage(file, 400);
      const filePath = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, resized, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Add cache-buster to prevent stale/low-res cached images
      const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;

      if (publicUrl) {
        await supabase
          .from("users")
          .update({ avatar_url: publicUrl })
          .eq("id", user.id);

        setLocalUrl(publicUrl);
        showSnackbar("Avatar updated");
        onUpdate();
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
      showSnackbar("Failed to upload avatar", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!user) return;
    setUploading(true);
    try {
      // Remove from storage
      await supabase.storage.from("avatars").remove([`${user.id}/avatar.jpg`]);
      // Clear URL in DB
      await supabase.from("users").update({ avatar_url: null }).eq("id", user.id);
      setLocalUrl(null);
      showSnackbar("Avatar removed");
      onUpdate();
    } catch (err) {
      console.error("Remove failed:", err);
      showSnackbar("Failed to remove avatar", "error");
    } finally {
      setUploading(false);
    }
  }

  const initials = getInitials(fullName || "User");

  return (
    <div className="relative group">
      <button
        onClick={() => fileRef.current?.click()}
        className="relative h-24 w-24 rounded-full overflow-hidden flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
        disabled={uploading}
      >
        {localUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={localUrl}
            alt="Avatar"
            className="h-full w-full object-cover"
            width={192}
            height={192}
            style={{ imageRendering: "auto" }}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #F6D365 0%, #FDA085 40%, #A18CD1 70%, #5FC3E4 100%)",
            }}
          >
            {initials}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
          <Camera size={20} className="text-white" />
        </div>

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}
      </button>

      {localUrl && (
        <button
          onClick={(e) => { e.stopPropagation(); handleRemove(); }}
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-faint)] hover:text-[var(--red-muted)] hover:border-[var(--red-muted)] shadow-sm"
          title="Remove photo"
        >
          <X size={12} />
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />
    </div>
  );
}
