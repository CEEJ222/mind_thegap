const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Model selection by task complexity
export const MODELS = {
  // Complex reasoning: gap analysis, resume generation
  REASONING: "anthropic/claude-sonnet-4-20250514",
  // Structured extraction: document parsing, URL scraping
  EXTRACTION: "anthropic/claude-sonnet-4-20250514",
  // Light tasks: single theme rescore
  LIGHT: "anthropic/claude-haiku-4-5-20251001",
} as const;

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterOptions {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
}

export async function chatCompletion(options: OpenRouterOptions): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:3000",
      "X-Title": "Mind the Gap",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`OpenRouter error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}
