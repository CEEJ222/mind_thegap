"use client";

import { useState } from "react";

interface TopNavProps {
  companyName?: string;
  jobTitle?: string;
  fitScore?: number | null;
}

export function TopNav({ companyName, jobTitle, fitScore }: TopNavProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-9">
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
      <div className="relative">
        {fitScore !== undefined && fitScore !== null && (
          <div
            className="cursor-default"
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
      </div>
    </header>
  );
}
