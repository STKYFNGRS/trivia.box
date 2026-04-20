/**
 * Fixed, app-wide film-grain overlay. CSS-only — no image asset, no JS. Sits
 * above the stage background but below content (`z-0`) via `pointer-events: none`.
 */
export function FilmGrain() {
  return <div aria-hidden className="noise-veil" />;
}
