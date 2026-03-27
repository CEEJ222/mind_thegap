"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { showSnackbar } from "@/components/ui/snackbar";
import { Camera } from "lucide-react";

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    try {
      const filePath = `${user.id}/avatar.${file.name.split(".").pop()}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;

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

  const initials = getInitials(fullName || "User");

  return (
    <div className="relative group">
      <button
        onClick={() => fileRef.current?.click()}
        className="relative h-20 w-20 rounded-full overflow-hidden flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
        disabled={uploading}
      >
        {localUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={localUrl}
            alt="Avatar"
            className="h-full w-full object-cover"
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
