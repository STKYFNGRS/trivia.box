import type { MetadataRoute } from "next";

/**
 * PWA manifest — unlocks "Add to Home Screen" on mobile browsers, which is
 * table stakes for a bar-trivia app (players launch from their phones the
 * moment they walk in). Icons reference `app/icon.tsx` so we don't need to
 * ship static PNGs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "trivia.box",
    short_name: "trivia.box",
    description:
      "Play live trivia at your local bar, solo, or in a free house game every 15 minutes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0613",
    theme_color: "#0a0613",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "any",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    categories: ["games", "entertainment", "social"],
  };
}
