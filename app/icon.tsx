import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * App favicon (32x32). Rendered as a neon-magenta rounded square with a
 * lime "T" — mirrors the marketing wordmark mark. Served by Next at /icon.
 */
export default function Icon() {
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
            "linear-gradient(135deg, #ff3bd4 0%, #ff7ae6 50%, #ff3bd4 100%)",
          borderRadius: 8,
          color: "#c8ff3b",
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "system-ui",
          letterSpacing: "-0.05em",
        }}
      >
        T
      </div>
    ),
    { ...size }
  );
}
