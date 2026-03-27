import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "dispute" | "save-rescore" | "fab";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", children, ...props }, ref) => {
    if (variant === "dispute") {
      return (
        <button
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
            "rounded-[7px] px-[11px] py-[5px] text-[11px] font-bold text-white",
            "bg-[var(--accent)] border-[0.5px] border-black/50",
            "hover:bg-[var(--accent-dark)]",
            className
          )}
          ref={ref}
          {...props}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="white">
            <path d="M8.5 1.5L2 9h5.5l-1 5.5L14 7H8.5l1-5.5z" />
          </svg>
          {children}
        </button>
      );
    }

    if (variant === "save-rescore") {
      return (
        <button
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
            "rounded-lg px-[18px] py-2 text-xs font-bold",
            "bg-[var(--text-primary)] text-[var(--accent)] border border-black/50",
            "hover:bg-[#2a2a2e]",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </button>
      );
    }

    if (variant === "fab") {
      return (
        <button
          className={cn(
            "inline-flex items-center gap-2 whitespace-nowrap transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
            "rounded-full px-[22px] py-[13px] text-sm font-bold text-white",
            "bg-gradient-to-br from-[#3DD9B3] via-[#1BA88A] to-[#0D6B58]",
            "border border-black/35",
            "shadow-[0_4px_20px_rgba(0,0,0,0.18)]",
            "hover:-translate-y-px hover:shadow-[0_6px_28px_rgba(0,0,0,0.25)]",
            className
          )}
          ref={ref}
          {...props}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z" />
          </svg>
          {children}
        </button>
      );
    }

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]": variant === "default",
            "border border-[var(--border-input)] bg-transparent hover:bg-[var(--bg-card)]":
              variant === "outline",
            "hover:bg-[var(--bg-card)]": variant === "ghost",
            "bg-[var(--red-muted)] text-white hover:bg-[var(--red-muted)]/90": variant === "destructive",
          },
          {
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-md px-3": size === "sm",
            "h-11 rounded-md px-8": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
