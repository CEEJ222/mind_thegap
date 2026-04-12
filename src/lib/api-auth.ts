import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Authenticated user context derived from a Next.js API request.
 *
 * Priority order:
 *   1. `Authorization: Bearer <access_token>` header (Chrome extension)
 *   2. Supabase session cookies (web app)
 *
 * Body params are never trusted for identity — this closes a pre-existing
 * IDOR hole where `user_id` was read from the request body and passed to
 * the service-role Supabase client.
 */
export interface AuthedUser {
  userId: string;
  email: string | null;
}

/**
 * Resolve the authenticated user for an API request, or return a 401
 * NextResponse if credentials are missing or invalid.
 *
 * Usage:
 *   const auth = await requireAuthedUser(req);
 *   if (auth instanceof NextResponse) return auth;
 *   const { userId } = auth;
 */
export async function requireAuthedUser(
  request: NextRequest,
): Promise<AuthedUser | NextResponse> {
  const user = await tryBearerAuth(request);
  if (user) return user;

  const cookieUser = await tryCookieAuth();
  if (cookieUser) return cookieUser;

  return NextResponse.json(
    { error: "Unauthorized", code: "UNAUTHENTICATED" },
    { status: 401 },
  );
}

async function tryBearerAuth(
  request: NextRequest,
): Promise<AuthedUser | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  // Anon client is sufficient to validate the JWT — getUser(token) verifies
  // the signature against the project's JWT secret and returns the user.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null };
}

async function tryCookieAuth(): Promise<AuthedUser | null> {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // No-op in API context; middleware handles cookie refresh.
          },
        },
      },
    );
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { userId: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
