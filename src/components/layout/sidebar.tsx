"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Sparkles,
  User,
  Briefcase,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/generate", label: "Generate", icon: Sparkles },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { signOut, hasProfile } = useAuth();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/generate" className="text-lg font-semibold">
            Mind <span className="text-accent">the Gap</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 hover:bg-muted"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const isLocked = item.href === "/generate" && !hasProfile;

          return (
            <Link
              key={item.href}
              href={isLocked ? "/profile" : item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                isLocked && "opacity-50"
              )}
            >
              <item.icon size={18} />
              {!collapsed && (
                <span>
                  {item.label}
                  {isLocked && " (locked)"}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
