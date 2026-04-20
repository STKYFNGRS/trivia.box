import { getAnthropicApiKey, getAnthropicModelId } from "@/lib/ai/anthropicConfig";

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessageResponse = {
  id?: string;
  type?: string;
  role?: string;
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractTextFromMessage(data: AnthropicMessageResponse): string {
  const blocks = data.content ?? [];
  const texts = blocks.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text as string);
  return texts.join("\n").trim();
}

/** Claude often wraps JSON in markdown fences; strip before parse. */
export function stripMarkdownJsonFences(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/im;
  const m = s.match(fence);
  if (m?.[1]) {
    return m[1]!.trim();
  }
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    s = s.replace(/\s*```\s*$/i, "");
  }
  return s.trim();
}

export type AnthropicCallMeta = {
  inputTokens?: number;
  outputTokens?: number;
};

/**
 * Calls Claude Messages API and parses the first text block as JSON.
 * Retries on 429 / 529 with exponential backoff.
 */
export async function anthropicMessagesJson<T>(input: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ data: T; meta: AnthropicCallMeta }> {
  const key = getAnthropicApiKey();
  if (!key) {
    throw new Error("No Claude API key configured (set ANTHROPIC_API_KEY or CLAUDE_API_KEY)");
  }
  const model = getAnthropicModelId();
  const maxTokens = input.maxTokens ?? 8192;

  let attempt = 0;
  const maxAttempts = 5;
  let lastErr: Error | null = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      }),
    });

    const rawText = await res.text();
    let parsed: AnthropicMessageResponse;
    try {
      parsed = JSON.parse(rawText) as AnthropicMessageResponse;
    } catch {
      throw new Error(`Anthropic non-JSON response ${res.status}: ${rawText.slice(0, 200)}`);
    }

    if (parsed.error?.message) {
      throw new Error(`Anthropic error: ${parsed.error.message}`);
    }

    if (res.status === 429 || res.status === 529) {
      const wait = Math.min(30_000, 800 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 400);
      lastErr = new Error(`Anthropic ${res.status}: ${rawText.slice(0, 200)}`);
      if (attempt < maxAttempts) {
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }

    if (!res.ok) {
      throw new Error(`Anthropic error ${res.status}: ${rawText.slice(0, 240)}`);
    }

    const text = extractTextFromMessage(parsed);
    if (!text) {
      throw new Error("Empty Anthropic message content");
    }

    const jsonText = stripMarkdownJsonFences(text);
    let data: T;
    try {
      data = JSON.parse(jsonText) as T;
    } catch (e) {
      throw new Error(
        `Anthropic returned non-JSON text: ${jsonText.slice(0, 200)} (${e instanceof Error ? e.message : "parse error"})`
      );
    }

    return {
      data,
      meta: {
        inputTokens: parsed.usage?.input_tokens,
        outputTokens: parsed.usage?.output_tokens,
      },
    };
  }

  throw lastErr ?? new Error("Anthropic request failed after retries");
}
