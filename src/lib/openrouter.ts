const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenRouter model IDs change when providers deprecate slugs. If you see
 * `No endpoints found for anthropic/...`, check https://openrouter.ai/models and
 * update these, or set OPENROUTER_MODEL_* env vars (see below).
 */
function envModel(envKey: string, fallback: string): string {
  const v = process.env[envKey]?.trim();
  return v || fallback;
}

// Model selection by task complexity
export const MODELS = {
  // Complex reasoning: gap analysis, resume generation
  REASONING: envModel(
    "OPENROUTER_MODEL_REASONING",
    "anthropic/claude-3.7-sonnet"
  ),
  // Structured extraction: document parsing, URL scraping
  EXTRACTION: envModel(
    "OPENROUTER_MODEL_EXTRACTION",
    "anthropic/claude-3.7-sonnet"
  ),
  // Light tasks: single theme rescore, summaries
  LIGHT: envModel("OPENROUTER_MODEL_LIGHT", "anthropic/claude-3.5-haiku"),
};

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Optional OpenRouter routing. If unset, we do **not** send a `provider` field so account-wide
 * privacy / ignored providers on openrouter.ai/settings/privacy are not stacked with app defaults
 * (which caused "All providers have been ignored" / 404).
 *
 * To prefer Anthropic’s API (e.g. avoid Bedrock), set in env:
 * `OPENROUTER_PROVIDER_ORDER=anthropic`
 * (comma-separated list; only after Anthropic is allowed in Privacy settings.)
 */
function getOptionalProviderFromEnv(): Record<string, unknown> | undefined {
  const raw = process.env.OPENROUTER_PROVIDER_ORDER?.trim();
  if (!raw) return undefined;
  const order = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return order.length ? { order } : undefined;
}

interface OpenRouterOptions {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  /** Extra OpenRouter `provider` fields; merged with env-based preferences. */
  provider?: Record<string, unknown>;
}

/**
 * OpenRouter / some models return `message.content` as a string, or as an array of
 * content blocks (e.g. `{ type: "text", text: "..." }`). Missing content used to
 * throw when we called `.trim()` on undefined.
 */
export function normalizeAssistantContent(data: {
  choices?: Array<{ message?: { content?: unknown } }>;
}): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return String((block as { text: string }).text);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content == null) return "";
  return String(content);
}

/**
 * Extract JSON from a response that may contain markdown fences or extra text.
 */
function extractJSON(text: string): string {
  // Try to find JSON inside markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find a JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();

  // Return as-is and let JSON.parse handle the error
  if (typeof text !== "string") return "";
  return text.trim();
}

export async function chatCompletion(options: OpenRouterOptions): Promise<string> {
  const mergedProvider = {
    ...(getOptionalProviderFromEnv() ?? {}),
    ...(options.provider ?? {}),
  };
  const hasProvider = Object.keys(mergedProvider).length > 0;

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:3000",
      "X-Title": "Mind the App",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.3,
      ...(hasProvider ? { provider: mergedProvider } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`OpenRouter error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const raw = normalizeAssistantContent(data);
  if (!raw.trim()) {
    throw new Error("OpenRouter returned empty assistant content");
  }
  return extractJSON(raw);
}
