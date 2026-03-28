"use client";

import { useState, useEffect } from "react";
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
  Menu,
  X,
  Search,
} from "lucide-react";

const navItems = [
  { href: "/generate", label: "Generate", icon: Sparkles },
  { href: "/jobs", label: "Jobs", icon: Search },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/applications", label: "Applications", icon: Briefcase },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { signOut } = useAuth();

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile nav is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile floating nav button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-md md:hidden"
      >
        <Menu size={18} className="text-[var(--text-primary)]" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static, mobile: slide-over */}
      <aside
        className={cn(
          // Desktop
          "hidden md:flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-base)] transition-all duration-200",
          collapsed ? "w-16" : "w-[215px]"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          pathname={pathname}
          signOut={signOut}
        />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[var(--bg-base)] shadow-xl transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-card)]"
        >
          <X size={18} />
        </button>
        <SidebarContent
          collapsed={false}
          setCollapsed={() => {}}
          pathname={pathname}
          signOut={() => { signOut(); setMobileOpen(false); }}
          onNavClick={() => setMobileOpen(false)}
        />
      </aside>
    </>
  );
}

function SidebarContent({
  collapsed,
  setCollapsed,
  pathname,
  signOut,
  onNavClick,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  pathname: string;
  signOut: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/generate" className="text-lg font-semibold text-[var(--text-primary)]" onClick={onNavClick}>
            Mind <span className="text-[var(--accent)]">the App</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-card)] hidden md:block"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--accent)] text-[#0A5040] font-semibold"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
              )}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border-subtle)] p-2 space-y-1">
        <Link
          href="/settings"
          onClick={onNavClick}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-[var(--accent)] text-[#0A5040] font-semibold"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
          )}
        >
          <Settings size={18} />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </>
  );
}
