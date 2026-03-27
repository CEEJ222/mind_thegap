"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];

interface AuthContextType {
  user: User | null;
  settings: UserSettings | null;
  loading: boolean;
  hasProfile: boolean;
  refreshSettings: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  settings: null,
  loading: true,
  hasProfile: false,
  refreshSettings: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const supabase = createClient();

  async function refreshSettings() {
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (data) setSettings(data);
  }

  async function checkProfile(userId: string) {
    const { count } = await supabase
      .from("profile_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    setHasProfile((count ?? 0) > 0);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setSettings(null);
    setHasProfile(false);
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await refreshSettings();
        await checkProfile(currentUser.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, settings, loading, hasProfile, refreshSettings, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
