/**
 * Deterministic per-question choice shuffle.
 *
 * Why this exists: the host `/api/game/sessions/[sessionId]/host` route shuffles
 * choices once and publishes the result to Ably. Players and displays that load
 * the page fresh hit `/api/game/public/session` for a bootstrap, which was
 * producing an *independent* random shuffle — meaning a refreshed player saw
 * A/B/C/D in a different order than the rest of the room, and an unlucky
 * timing where bootstrap rendered before Ably's rewind could cause the
 * buttons to rearrange under the player's finger.
 *
 * Seeding the shuffle with `sessionQuestionId` (a stable UUID) makes both
 * code paths agree on ordering without requiring a new DB column.
 *
 * The algorithm is a standard Fisher-Yates driven by a mulberry32 PRNG seeded
 * by a FNV-1a hash of the session-question id. Both are deterministic in
 * pure JS, do not depend on env, and are cheap.
 */

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Return a copy of `items` shuffled deterministically for the given
 * `sessionQuestionId`. Callers should pass the question's correct answer +
 * wrong answers already combined (see `buildChoiceList`).
 */
export function shuffleChoicesFor<T>(sessionQuestionId: string, items: T[]): T[] {
  const out = [...items];
  const rng = mulberry32(fnv1a32(sessionQuestionId));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Helper: given a correct answer and the list of wrong answers, produce the
 * final choices array in deterministic order for a session question.
 */
export function buildChoiceList(
  sessionQuestionId: string,
  correctAnswer: string,
  wrongAnswers: string[] | null | undefined
): string[] {
  const all = [correctAnswer, ...(wrongAnswers ?? [])].filter(
    (c): c is string => typeof c === "string" && c.length > 0
  );
  return shuffleChoicesFor(sessionQuestionId, all);
}
