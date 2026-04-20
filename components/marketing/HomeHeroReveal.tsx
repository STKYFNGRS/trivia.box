"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Hero container with a staggered slide-up reveal on mount. Intentionally
 * minimal — we animate the whole container, not individual words, so the
 * effect is calm rather than kinetic and there's no layout thrash.
 *
 * Respects `prefers-reduced-motion` via `useReducedMotion` — those users
 * see the content appear instantly.
 */
export function HomeHeroReveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
