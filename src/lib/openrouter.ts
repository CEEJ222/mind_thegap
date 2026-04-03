const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Model selection by task complexity
export const MODELS = {
  // Complex reasoning: gap analysis, resume generation
  REASONING: "anthropic/claude-3.5-sonnet",
  // Structured extraction: document parsing, URL scraping
  EXTRACTION: "anthropic/claude-3.5-sonnet",
  // Light tasks: single theme rescore
  LIGHT: "anthropic/claude-3-haiku",
} as const;

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** OpenRouter may route Anthropic models through Amazon Bedrock; Bedrock has rejected some model IDs. Prefer other providers. */
const DEFAULT_PROVIDER_PREFERENCES = {
  ignore: ["amazon-bedrock"],
} as const;

interface OpenRouterOptions {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  /** Merged with defaults (e.g. ignore Bedrock). */
  provider?: Record<string, unknown>;
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
  return text.trim();
}

export async function chatCompletion(options: OpenRouterOptions): Promise<string> {
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
      provider: {
        ...DEFAULT_PROVIDER_PREFERENCES,
        ...options.provider,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`OpenRouter error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content;
  return extractJSON(raw);
}
