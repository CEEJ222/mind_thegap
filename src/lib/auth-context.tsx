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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  settings: null,
  loading: true,
  hasProfile: false,
  refreshSettings: async () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const supabase = createClient();
  const initialized = useRef(false);

  async function loadUserData(userId: string) {
    try {
      const [settingsRes, profileRes] = await Promise.all([
        supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", userId)
          .limit(1),
        supabase
          .from("profile_entries")
          .select("id")
          .eq("user_id", userId)
          .limit(1),
      ]);

      if (settingsRes.data?.[0]) setSettings(settingsRes.data[0] as UserSettings);
      setHasProfile((profileRes.data?.length ?? 0) > 0);
    } catch {
      // Supabase query failed — leave defaults
    }
  }

  const refreshSettings = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .limit(1);
      if (data?.[0]) setSettings(data[0] as UserSettings);
    } catch {
      // ignore
    }
  }, [user, supabase]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("profile_entries")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      setHasProfile((data?.length ?? 0) > 0);
    } catch {
      // ignore
    }
  }, [user, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setSettings(null);
    setHasProfile(false);
    window.location.href = "/";
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Hard timeout — never spin forever
    const timeout = setTimeout(() => setLoading(false), 5000);

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const currentUser = data.user;
        setUser(currentUser);
        if (currentUser) {
          await loadUserData(currentUser.id);
        }
      } catch {
        // auth failed — leave defaults
      } finally {
        setLoading(false);
        clearTimeout(timeout);
      }
    })();

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
