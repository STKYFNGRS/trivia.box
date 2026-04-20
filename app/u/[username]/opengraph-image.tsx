import { ImageResponse } from "next/og";
import { getPublicPlayerStats } from "@/lib/game/publicPlayerStats";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Trivia.Box player profile";

// Satori (the library behind `next/og`) can't parse the CSS `background`
// shorthand when it mixes gradients and a trailing solid color — keep solid
// fills on `backgroundColor` and stack gradients in `backgroundImage` only.
// Same pattern as `app/opengraph-image.tsx`.

function level(xp: number) {
  return Math.max(1, Math.floor(xp / 1000) + 1);
}

export default async function PlayerOpenGraphImage({
  params,
}: {
  params: { username: string };
}) {
  const stats = await getPublicPlayerStats(params.username);
  const username = stats?.player.username ?? params.username;
  const lvl = stats ? level(stats.rollup.totalXp) : 1;
  const score = stats ? stats.rollup.totalPoints.toLocaleString() : "0";
  const trophies = stats ? stats.achievements.length : 0;
  const games = stats ? stats.rollup.totalGames.toLocaleString() : "0";

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
            "radial-gradient(ellipse at 50% 100%, rgba(200,255,59,0.32), transparent 55%)",
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

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#c6c1d8",
            }}
          >
            Player profile
          </div>
          <div
            style={{
              fontSize: 140,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              backgroundImage:
                "linear-gradient(90deg, #ff3bd4 0%, #c8ff3b 45%, #3bd4ff 100%)",
              backgroundClip: "text",
              color: "transparent",
              maxWidth: "1050px",
            }}
          >
            {username}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#f7f4ff",
            fontSize: 28,
            gap: 32,
          }}
        >
          <div style={{ display: "flex", gap: 48 }}>
            <Stat label="Level" value={String(lvl)} />
            <Stat label="Score" value={score} />
            <Stat label="Trophies" value={String(trophies)} />
            <Stat label="Games" value={games} />
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
    { ...size },
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#c6c1d8",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 48, fontWeight: 800, color: "#f7f4ff" }}>{value}</div>
    </div>
  );
}
