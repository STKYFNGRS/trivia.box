"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Scroll-linked section header fade-in. Fires once when the element enters
 * the viewport (25% threshold), then stops watching. Pure Framer Motion —
 * no IntersectionObserver boilerplate needed.
 */
export function HomeSectionFade({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
