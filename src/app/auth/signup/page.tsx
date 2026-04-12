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

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [extensionHandoff, setExtensionHandoff] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Forward the session to the extension if this flow was kicked off
    // from the Mind the App side panel. If email confirmation is on,
    // `getSession()` will return null — in that case we just show the
    // handoff screen and let the user confirm their email.
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

    window.location.href = "/profile";
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
              ? "Account created — return to the Mind the App side panel"
              : "Create your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {extensionHandoff ? (
            <div className="space-y-3 text-center text-sm text-muted-foreground">
              <p>
                Your session has been shared with the Mind the App Chrome
                extension. If we sent a confirmation email, open it to
                finish signing in.
              </p>
              <p>You can close this tab.</p>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Full Name
              </label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>
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
              <label className="mb-1 block text-sm font-medium">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
          )}
          {!extensionHandoff && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={withExtensionParam("/auth/login")}
                className="text-accent hover:underline"
              >
                Sign in
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
