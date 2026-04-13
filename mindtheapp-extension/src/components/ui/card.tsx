import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-lg border border-panel-border bg-panel-surface p-4 shadow-panel",
        className,
      )}
      {...props}
    />
  );
}
