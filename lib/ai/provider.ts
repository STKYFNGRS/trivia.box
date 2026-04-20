import { getAnthropicApiKey } from "@/lib/ai/anthropicConfig";

export type QuestionLlmProvider = "anthropic" | "openai";

/**
 * `QUESTION_LLM_PROVIDER=anthropic|openai` overrides auto-detection.
 * Default: anthropic when `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` is set, otherwise openai.
 */
export function getQuestionLlmProvider(): QuestionLlmProvider {
  const explicit = process.env.QUESTION_LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai") return "openai";
  if (explicit === "anthropic") return "anthropic";
  if (getAnthropicApiKey()) return "anthropic";
  return "openai";
}
