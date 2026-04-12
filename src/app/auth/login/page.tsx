"use client";

import { useState } from "react";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  isExtensionAuthFlow,
  sendTokenToExtension,
  withExtensionParam,
} from "@/lib/extension-auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [extensionHandoff, setExtensionHandoff] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // If the Mind the App extension kicked off this flow, forward the
    // session token to it before continuing. The extension's background
    // service worker stores the token and closes this tab.
    if (isExtensionAuthFlow()) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await sendTokenToExtension(session.access_token);
      }
      setExtensionHandoff(true);
      setLoading(false);
      return;
    }

    // Hard redirect so middleware sets cookies properly
    window.location.href = "/generate";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            Mind <span className="text-accent">the App</span>
          </CardTitle>
          <CardDescription>
            {extensionHandoff
              ? "Signed in — return to the Mind the App side panel"
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {extensionHandoff ? (
            <div className="space-y-3 text-center text-sm text-muted-foreground">
              <p>
                Your session has been shared with the Mind the App Chrome
                extension.
              </p>
              <p>You can close this tab.</p>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-error">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          )}
          {!extensionHandoff && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href={withExtensionParam("/auth/signup")}
                className="text-accent hover:underline"
              >
                Sign up
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
