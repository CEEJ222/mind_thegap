"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface TopNavProps {
  companyName?: string;
  jobTitle?: string;
  fitScore?: number | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function TopNav({ companyName, jobTitle, fitScore }: TopNavProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const supabase = createClient();

  // Load avatar URL once
  if (user && !loaded) {
    setLoaded(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("users")
          .select("avatar_url")
          .eq("id", user.id)
          .limit(1);
        if (data?.[0]?.avatar_url) setAvatarUrl(data[0].avatar_url);
      } catch {
        // ignore
      }
    })();
  }

  const fullName = user?.user_metadata?.full_name || user?.email || "User";
  const initials = getInitials(fullName);

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 md:px-9">
      <div>
        {companyName && (
          <>
            <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {companyName}
            </div>
            <div className="text-base font-bold text-[var(--text-primary)]">
              {jobTitle}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {fitScore !== undefined && fitScore !== null && (
          <div
            className="relative cursor-default"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span className="text-[28px] font-extrabold text-[var(--accent)]">
              {fitScore}
            </span>
            {showTooltip && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-[10px] bg-[#1C1C1E] p-4 text-xs text-white shadow-lg">
                <p className="mb-1 font-semibold">Fit Score</p>
                <p className="text-white/70">
                  Weighted average of all theme scores. Themes are weighted by JD
                  emphasis — frequency, placement, and qualifying language like
                  &ldquo;must have&rdquo; vs &ldquo;nice to have.&rdquo;
                </p>
              </div>
            )}
          </div>
        )}
        <Link href="/profile">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Profile"
              className="h-9 w-9 rounded-full object-cover border border-[var(--border-subtle)]"
            />
          ) : (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #F6D365 0%, #FDA085 40%, #A18CD1 70%, #5FC3E4 100%)",
              }}
            >
              {initials}
            </div>
          )}
        </Link>
      </div>
    </header>
  );
}
