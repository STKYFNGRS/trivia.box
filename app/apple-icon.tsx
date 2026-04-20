import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Apple touch icon (180x180). Same mark as the 32x32 favicon, scaled up
 * with a bit more border presence so it reads well on a home-screen.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #ff3bd4 0%, #b845ff 60%, #3bd4ff 100%)",
          borderRadius: 40,
          color: "#c8ff3b",
          fontSize: 120,
          fontWeight: 800,
          fontFamily: "system-ui",
          letterSpacing: "-0.08em",
        }}
      >
        T
      </div>
    ),
    { ...size }
  );
}
