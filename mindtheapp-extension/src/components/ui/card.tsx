import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-lg border border-ink/10 bg-white/60 p-4 shadow-sm backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
