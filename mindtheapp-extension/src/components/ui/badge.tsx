import * as React from "react";
import { cn } from "@/lib/cn";
import type { ScoreTier } from "@/lib/types";

const tierStyles: Record<ScoreTier, string> = {
  strong: "bg-tier-strong/15 text-tier-strong border-tier-strong/40",
  weak: "bg-tier-weak/15 text-tier-weak border-tier-weak/40",
  none: "bg-tier-none/15 text-tier-none border-tier-none/40",
};

export function TierBadge({
  tier,
  className,
}: {
  tier: ScoreTier;
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tierStyles[tier],
        className,
      )}
    >
      {tier}
    </span>
  );
}
