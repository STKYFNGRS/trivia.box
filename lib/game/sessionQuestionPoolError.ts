/** Thrown when a session round cannot be filled from the vetted category pool. */
export class InsufficientQuestionPoolError extends Error {
  readonly code = "INSUFFICIENT_QUESTION_POOL" as const;

  constructor(
    public readonly roundNumber: number,
    public readonly category: string,
    public readonly needed: number,
    public readonly available: number,
    public readonly pinnedCount: number
  ) {
    super(
      `Not enough vetted questions for round ${roundNumber} (${category}): need ${needed} more after ${pinnedCount} pinned, only ${available} available in pool`
    );
    this.name = "InsufficientQuestionPoolError";
  }
}
