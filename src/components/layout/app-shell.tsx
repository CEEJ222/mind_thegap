"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";

interface TopNavData {
  companyName?: string;
  jobTitle?: string;
  fitScore?: number | null;
}

interface AppShellContextType {
  setTopNav: (data: TopNavData) => void;
  clearTopNav: () => void;
}

const AppShellContext = createContext<AppShellContextType>({
  setTopNav: () => {},
  clearTopNav: () => {},
});

export function useAppShell() {
  return useContext(AppShellContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [topNavData, setTopNavData] = useState<TopNavData>({});

  const setTopNav = useCallback((data: TopNavData) => {
    setTopNavData(data);
  }, []);

  const clearTopNav = useCallback(() => {
    setTopNavData({});
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-base)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  return (
    <AppShellContext.Provider value={{ setTopNav, clearTopNav }}>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopNav
            companyName={topNavData.companyName}
            jobTitle={topNavData.jobTitle}
            fitScore={topNavData.fitScore}
          />
          <main className="relative flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}
