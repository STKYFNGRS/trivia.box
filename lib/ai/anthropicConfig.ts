/**
 * Claude is the only supported question-generation provider. We read a
 * single env var — `CLAUDE_API_KEY` — to keep ops simple. If the key is
 * missing, callers throw a typed error and the admin UI surfaces a clear
 * `LLM_NOT_CONFIGURED` hint.
 */
export function getClaudeApiKey(): string | undefined {
  return process.env.CLAUDE_API_KEY?.trim() || undefined;
}

/**
 * Model override (optional). Defaults to the latest Sonnet snapshot we've
 * qualified the prompts against; bump here when upgrading the pipeline.
 */
export function getClaudeModelId(): string {
  return process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-20250514";
}
