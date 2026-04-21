"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Same gradient as profile avatar / top-nav placeholder */
const AVATAR_PLACEHOLDER_GRADIENT =
  "linear-gradient(135deg, #F6D365 0%, #FDA085 40%, #A18CD1 70%, #5FC3E4 100%)";

function initialsFromLabel(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (n[0] || "?").toUpperCase();
}

interface CompanyLogoProps {
  logoUrl: string | null | undefined;
  companyName: string | null | undefined;
  className?: string;
}

export function CompanyLogo({ logoUrl, companyName, className }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const trimmed = typeof logoUrl === "string" ? logoUrl.trim() : "";
  const showImage = Boolean(trimmed) && !failed;
  const initials = initialsFromLabel(companyName);

  return (
    <div className={cn("flex h-full w-full items-center justify-center overflow-hidden", className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trimmed}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-xs font-bold text-white sm:text-sm"
          style={{ background: AVATAR_PLACEHOLDER_GRADIENT }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
