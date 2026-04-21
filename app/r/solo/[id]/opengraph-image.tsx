import { ImageResponse } from "next/og";
import { loadPublicSoloRecap } from "@/lib/share/recapData";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Trivia.Box solo recap";

/**
 * OG image for a solo recap link. Shows the player's total score,
 * correct count, and a daily-challenge flag when applicable. Falls
 * back to a generic Trivia.Box card if the id doesn't resolve.
 */
export default async function SoloRecapOG({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recap = await loadPublicSoloRecap(id);
  const who = recap?.ownerUsername ?? "Trivia.Box";
  const score = recap ? recap.totalScore.toLocaleString() : "0";
  const correct = recap ? `${recap.correctCount}/${recap.questionCount}` : "0/0";
  const accuracy = recap ? `${recap.accuracyPercent}%` : "0%";
  const isDaily = Boolean(recap?.dailyChallengeDate);

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
            justifyContent: "space-between",
            gap: 16,
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
          {isDaily ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 999,
                backgroundColor: "rgba(255,190,59,0.18)",
                color: "#ffe08a",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Daily challenge
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#c6c1d8",
            }}
          >
            Solo recap
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
              display: "flex",
            }}
          >
            {who}
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
            <Stat label="Score" value={score} />
            <Stat label="Correct" value={correct} />
            <Stat label="Accuracy" value={accuracy} />
          </div>
          <div
            style={{
              padding: "14px 22px",
              borderRadius: 999,
              backgroundColor: "#c8ff3b",
              color: "#0a0613",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {isDaily ? "Play today" : "Beat this"}
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
      <div style={{ fontSize: 48, fontWeight: 800, color: "#f7f4ff" }}>
        {value}
      </div>
    </div>
  );
}
