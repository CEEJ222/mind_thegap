"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface UserSettings {
  id: string;
  user_id: string;
  output_format: string;
  include_summary: boolean;
  resume_length: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  settings: UserSettings | null;
  loading: boolean;
  hasProfile: boolean;
  refreshSettings: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  settings: null,
  loading: true,
  hasProfile: false,
  refreshSettings: async () => {},
  refreshProfile: async () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const supabase = createClient();
  const initialized = useRef(false);

  async function loadUserData(userId: string) {
    const [settingsRes, profileRes] = await Promise.all([
      supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("profile_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    if (settingsRes.data) setSettings(settingsRes.data as UserSettings);
    setHasProfile((profileRes.count ?? 0) > 0);
  }

  const refreshSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (data) setSettings(data as UserSettings);
  }, [user, supabase]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("profile_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    setHasProfile((count ?? 0) > 0);
  }, [user, supabase]);

  function signOut() {
    // Nuke cookies immediately — don't wait for anything
    document.cookie.split(";").forEach((c) => {
      const name = c.trim().split("=")[0];
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
    });
    // Clear localStorage too (Supabase sometimes stores tokens there)
    try { localStorage.clear(); } catch { /* ignore */ }
    // Fire and forget the API call
    supabase.auth.signOut().catch(() => {});
    // Redirect immediately
    window.location.replace("/auth/login");
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Hard timeout — never spin forever
    const timeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getUser()
      .then(({ data }: { data: { user: User | null } }) => {
        const currentUser = data.user;
        console.log("Auth getUser result:", currentUser?.id ?? "NO USER", currentUser?.email);
        setUser(currentUser);
        if (currentUser) {
          loadUserData(currentUser.id)
            .then(() => { setLoading(false); clearTimeout(timeout); })
            .catch((err) => { console.error("loadUserData error:", err); setLoading(false); clearTimeout(timeout); });
        } else {
          setLoading(false);
          clearTimeout(timeout);
        }
      })
      .catch(() => {
        setLoading(false);
        clearTimeout(timeout);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: string, session: { user: User | null } | null) => {
      try {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          await loadUserData(currentUser.id);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, settings, loading, hasProfile, refreshSettings, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
