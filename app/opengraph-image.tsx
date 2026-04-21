import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "trivia.box · Bar trivia, rebuilt.";

/**
 * OG image for the site root. Satori (the library behind `next/og`) cannot
 * parse the CSS `background` shorthand when it mixes gradients and a
 * trailing solid color — it tries to interpret the `#0a0613` as an image
 * URL and fails the build ("Invalid background image"). The workaround is
 * to keep the solid fill on `backgroundColor` and stack only gradients in
 * `backgroundImage`.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#0a0613",
          backgroundImage: [
            "radial-gradient(ellipse at 15% 20%, rgba(255,59,212,0.55), transparent 55%)",
            "radial-gradient(ellipse at 85% 30%, rgba(59,212,255,0.45), transparent 60%)",
            "radial-gradient(ellipse at 50% 100%, rgba(200,255,59,0.35), transparent 55%)",
          ].join(", "),
          fontFamily: "system-ui",
          color: "#f7f4ff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundImage: "linear-gradient(135deg, #ff3bd4, #b845ff)",
              color: "#c8ff3b",
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            T
          </div>
          trivia.box
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              fontSize: 110,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              maxWidth: "1000px",
            }}
          >
            Bar trivia,
          </div>
          <div
            style={{
              fontSize: 110,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              backgroundImage:
                "linear-gradient(90deg, #ff3bd4 0%, #c8ff3b 45%, #3bd4ff 100%)",
              backgroundClip: "text",
              color: "transparent",
              maxWidth: "1000px",
            }}
          >
            rebuilt for the regulars.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#c6c1d8",
            fontSize: 24,
          }}
        >
          <div style={{ maxWidth: 640 }}>
            Free house games every 30 min · Live venue nights · Solo runs any time.
          </div>
          <div
            style={{
              padding: "14px 22px",
              borderRadius: 999,
              backgroundColor: "#ff3bd4",
              color: "#0a0613",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Play now
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
