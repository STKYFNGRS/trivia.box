import type { MetadataRoute } from "next";

/**
 * PWA manifest — unlocks "Add to Home Screen" on mobile browsers, which is
 * table stakes for a bar-trivia app (players launch from their phones the
 * moment they walk in). Icons point at static PNGs shipped in `public/`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "trivia.box",
    short_name: "trivia.box",
    description:
      "Play live trivia at your local bar, solo, or in a free house game every 30 minutes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0613",
    theme_color: "#0a0613",
    orientation: "portrait",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    categories: ["games", "entertainment", "social"],
  };
}
