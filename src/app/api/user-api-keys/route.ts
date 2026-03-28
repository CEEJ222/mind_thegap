import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptApiKey } from "@/lib/crypto";

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data: keys } = await serviceClient
      .from("user_api_keys")
      .select("key_type, created_at, updated_at")
      .eq("user_id", user.id);

    // Never return encrypted values — only which key types exist
    return NextResponse.json({
      keys: (keys || []).map((k) => ({
        key_type: k.key_type,
        created_at: k.created_at,
        updated_at: k.updated_at,
      })),
    });
  } catch (err) {
    console.error("Get API keys error:", err);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key_type, api_key } = await request.json();

    if (!key_type || !api_key) {
      return NextResponse.json({ error: "Missing key_type or api_key" }, { status: 400 });
    }

    if (!["apify", "openrouter"].includes(key_type)) {
      return NextResponse.json({ error: "Invalid key_type" }, { status: 400 });
    }

    const encrypted = encryptApiKey(api_key);

    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from("user_api_keys")
      .upsert(
        {
          user_id: user.id,
          key_type,
          encrypted_value: encrypted,
        },
        { onConflict: "user_id,key_type" }
      );

    if (error) {
      console.error("Upsert API key error:", error);
      return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save API key error:", err);
    return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key_type } = await request.json();
    if (!key_type) {
      return NextResponse.json({ error: "Missing key_type" }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from("user_api_keys")
      .delete()
      .eq("user_id", user.id)
      .eq("key_type", key_type);

    if (error) {
      console.error("Delete API key error:", error);
      return NextResponse.json({ error: "Failed to remove key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete API key error:", err);
    return NextResponse.json({ error: "Failed to remove key" }, { status: 500 });
  }
}
