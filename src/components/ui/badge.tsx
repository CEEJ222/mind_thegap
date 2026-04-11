import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "strong" | "weak" | "none" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "border-transparent bg-accent text-black": variant === "default",
          "border-transparent bg-success/20 text-success": variant === "strong",
          "border-transparent bg-warning/20 text-warning": variant === "weak",
          "border-transparent bg-error/20 text-error": variant === "none",
          "border-border text-foreground": variant === "outline",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
