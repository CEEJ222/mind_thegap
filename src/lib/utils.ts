import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null): string {
  if (!date) return "Present";
  return new Date(date).toLocaleDateString("en-US", {
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
