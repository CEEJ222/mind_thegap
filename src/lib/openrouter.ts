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
  // Premium: nuanced long-form writing (screening question answers).
  // Opus produces noticeably richer first-person narrative than 3.7 Sonnet.
  PREMIUM: envModel(
    "OPENROUTER_MODEL_PREMIUM",
    "anthropic/claude-opus-4"
  ),
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
  /** When set, requests JSON-only output (OpenAI-compatible; supported by many OpenRouter models). */
  response_format?: { type: "json_object" };
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
 * Extract the first balanced JSON object or array, respecting strings (so `}` inside
 * "explanation" values does not terminate early). Greedy `/\{[\s\S]*\}/` breaks on that.
 */
function extractBalancedJson(text: string): string | null {
  const start = text.search(/[\[{]/);
  if (start === -1) return null;

  const openToClose: Record<string, string> = { "{": "}", "[": "]" };
  const first = text[start];
  if (first !== "{" && first !== "[") return null;

  const stack: string[] = [openToClose[first]];
  let inString = false;
  let escape = false;

  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") {
      stack.push(openToClose[c]);
      continue;
    }
    if (c === "}" || c === "]") {
      const expected = stack.pop();
      if (expected !== c) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract JSON from a response that may contain markdown fences or extra text.
 */
function extractJSON(text: string): string {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    return extractBalancedJson(inner) ?? inner;
  }

  const balanced = extractBalancedJson(trimmed);
  if (balanced) return balanced;

  const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();

  return trimmed;
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
      ...(options.response_format ? { response_format: options.response_format } : {}),
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
