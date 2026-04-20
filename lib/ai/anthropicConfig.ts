/**
 * Anthropic’s documented env is `ANTHROPIC_API_KEY`; many teams also use `CLAUDE_API_KEY`.
 * Either works; `ANTHROPIC_*` wins when both are set.
 */
export function getAnthropicApiKey(): string | undefined {
  const primary = process.env.ANTHROPIC_API_KEY?.trim();
  const alias = process.env.CLAUDE_API_KEY?.trim();
  return primary || alias || undefined;
}

export function getAnthropicModelId(): string {
  return (
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    "claude-sonnet-4-20250514"
  );
}
