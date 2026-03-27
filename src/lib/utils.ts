import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null): string {
  if (!date) return "Present";
  // Parse as local date to avoid timezone shift (YYYY-MM-DD → midnight local, not UTC)
  const [year, month] = date.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function getScoreTierIcon(tier: "strong" | "weak" | "none"): string {
  switch (tier) {
    case "strong":
      return "\u2705";
    case "weak":
      return "\u26A0\uFE0F";
    case "none":
      return "\u274C";
  }
}

export function getScoreTierColor(tier: "strong" | "weak" | "none"): string {
  switch (tier) {
    case "strong":
      return "text-success";
    case "weak":
      return "text-warning";
    case "none":
      return "text-error";
  }
}

export function getFitScoreColor(score: number): string {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}
