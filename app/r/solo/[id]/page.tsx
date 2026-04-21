import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareRecapButton } from "@/components/share/ShareRecapButton";
import { resolveSiteUrl } from "@/lib/email/siteUrl";
import { loadPublicSoloRecap } from "@/lib/share/recapData";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * Public solo recap landing page. The authenticated recap
 * (`/play/solo/[id]/recap`) stays owner-only and includes the
 * per-question breakdown; this public surface only reveals the
 * summary so daily-challenge shares don't leak the day's
 * questions/answers before everyone has played.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const recap = await loadPublicSoloRecap(id);
  if (!recap) return { title: "Recap — Trivia.Box" };
  const who = recap.ownerUsername ?? "A player";
  const title = recap.dailyChallengeDate
    ? `${who} scored ${recap.totalScore.toLocaleString()} on today's daily · Trivia.Box`
    : `${who} scored ${recap.totalScore.toLocaleString()} · Trivia.Box`;
  const description = `${recap.correctCount}/${recap.questionCount} correct · ${recap.accuracyPercent}% accuracy · ${recap.speed.toUpperCase()} speed.`;
  const canonical = `${resolveSiteUrl()}/r/solo/${id}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SoloRecapSharePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const recap = await loadPublicSoloRecap(id);
  if (!recap) notFound();

  const shareUrl = `${resolveSiteUrl()}/r/solo/${id}`;
  const who = recap.ownerUsername ?? "A player";
  const isDaily = Boolean(recap.dailyChallengeDate);

  return (
    <div className="min-h-screen bg-[var(--stage-bg)] text-white">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.32em] text-white/60">
            {isDaily ? "Daily challenge" : "Solo run"}
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            {who} · {recap.totalScore.toLocaleString()} pts
          </h1>
          <p className="text-sm text-white/70">
            {recap.correctCount} of {recap.questionCount} correct ·{" "}
            {recap.accuracyPercent}% accuracy · {recap.speed.toUpperCase()}{" "}
            speed · {recap.timerSeconds}s per question
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Score" value={recap.totalScore.toLocaleString()} />
          <StatTile
            label="Correct"
            value={`${recap.correctCount} / ${recap.questionCount}`}
          />
          <StatTile label="Accuracy" value={`${recap.accuracyPercent}%`} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {isDaily ? (
            <Link
              href="/play/daily"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--stage-accent)] px-4 py-2 text-sm font-semibold text-black ring-1 ring-[var(--stage-accent)]/50 transition hover:brightness-110"
            >
              Try today&apos;s daily
            </Link>
          ) : (
            <Link
              href="/play/solo"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--stage-accent)] px-4 py-2 text-sm font-semibold text-black ring-1 ring-[var(--stage-accent)]/50 transition hover:brightness-110"
            >
              Play a solo run
            </Link>
          )}
          {recap.ownerUsername ? (
            <Link
              href={`/u/${encodeURIComponent(recap.ownerUsername)}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
            >
              View {recap.ownerUsername}
            </Link>
          ) : null}
          <ShareRecapButton
            url={shareUrl}
            title={`${who} scored ${recap.totalScore.toLocaleString()} on Trivia.Box`}
            text={`${recap.correctCount}/${recap.questionCount} correct · ${recap.accuracyPercent}% accuracy`}
          />
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-white shadow-[var(--shadow-card)] backdrop-blur">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
        {label}
      </div>
      <div className="text-2xl font-black tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}
