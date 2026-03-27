"use client";

import { useAuth } from "@/lib/auth-context";
import { Settings } from "lucide-react";
import Link from "next/link";

export function TopNav() {
  const { user } = useAuth();

  return (
    <header className="flex h-14 items-center justify-end border-b border-border bg-background px-6">
      <div className="flex items-center gap-4">
        <Link
          href="/settings"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings size={18} />
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
          {user?.email?.charAt(0).toUpperCase() ?? "?"}
        </div>
      </div>
    </header>
  );
}
