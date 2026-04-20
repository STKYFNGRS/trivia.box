"use client";

import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function JoinClient() {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();
  const searchParams = useSearchParams();
  const initialCode = useMemo(() => (searchParams.get("code") ?? "").toUpperCase(), [searchParams]);

  const [joinCode, setJoinCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded || !userId) {
      setProfileReady(null);
      return;
    }
    void (async () => {
      const res = await fetch("/api/me/player");
      setProfileReady(res.ok);
    })();
  }, [isLoaded, userId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/players/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: joinCode.trim().toUpperCase() }),
      });
      const data = (await res.json()) as { playerId?: string; error?: unknown };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not join");
      }
      if (!data.playerId) {
        throw new Error("Missing player id");
      }
      const code = joinCode.trim().toUpperCase();
      router.push(`/game/${code}/play?playerId=${encodeURIComponent(data.playerId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
    } finally {
      setLoading(false);
    }
  }

  const padded = joinCode.padEnd(6, "·");

  return (
    <div className="relative flex min-h-[calc(100vh-14rem)] items-center justify-center overflow-hidden px-6 py-12 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, color-mix(in oklab, var(--neon-magenta) 18%, transparent), transparent 55%), radial-gradient(ellipse at 80% 100%, color-mix(in oklab, var(--neon-cyan) 14%, transparent), transparent 55%)",
        }}
      />

      <div className="relative z-10 w-full max-w-xl">
        <div className="mb-10 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85 backdrop-blur"
            style={{
              borderColor:
                "color-mix(in oklab, var(--neon-magenta) 35%, transparent)",
              background:
                "color-mix(in oklab, var(--neon-magenta) 10%, transparent)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--neon-lime)" }} />
            Ready to play
          </span>
          <h1
            className="mt-4 font-[family-name:var(--font-display)] font-extrabold tracking-[-0.03em] text-white"
            style={{ fontSize: "clamp(2.25rem, 6vw, 4rem)", lineHeight: 1 }}
          >
            Enter the join code
          </h1>
          <p className="mt-3 text-sm text-white/70 md:text-base">
            Grab the six-character code from the host&rsquo;s display and type it in.
          </p>
        </div>

        <SignedOut>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-[var(--shadow-card)] backdrop-blur">
            <p className="text-sm text-white/80">
              Sign in with your <span className="font-semibold text-white">player account</span> so your
              stats and trophies follow you across venues.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <SignInButton mode="modal">
                <Button
                  type="button"
                  className="h-11 w-full font-bold uppercase tracking-[0.12em]"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                    color: "oklch(0.1 0.02 270)",
                    boxShadow:
                      "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 40%, transparent), 0 10px 30px -10px color-mix(in oklab, var(--neon-magenta) 55%, transparent)",
                  }}
                >
                  Sign in to continue
                </Button>
              </SignInButton>
              <p className="text-xs text-white/60">
                New here?{" "}
                <Link
                  href="/sign-up"
                  className="font-semibold text-white underline underline-offset-4"
                >
                  Sign up as a player
                </Link>
              </p>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          {profileReady === false ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/80 shadow-[var(--shadow-card)] backdrop-blur">
              We could not load your profile. Try signing out and back in, or contact support.
            </div>
          ) : profileReady === null ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/70 shadow-[var(--shadow-card)] backdrop-blur">
              Checking your profile…
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[var(--shadow-hero)] backdrop-blur"
            >
              <Label
                htmlFor="code"
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
              >
                Join code
              </Label>

              <div className="relative mt-3">
                <div
                  aria-hidden
                  className="pointer-events-none flex select-none items-center justify-center gap-2 py-2 font-mono text-4xl font-black uppercase tracking-tight md:text-5xl"
                >
                  {padded.split("").map((ch, i) => {
                    const filled = i < joinCode.length;
                    const isCursor = i === joinCode.length;
                    return (
                      <span
                        key={i}
                        className="inline-flex h-14 w-12 items-center justify-center rounded-lg border transition md:h-16 md:w-14"
                        style={{
                          background: filled
                            ? "color-mix(in oklab, var(--neon-magenta) 14%, transparent)"
                            : "color-mix(in oklab, var(--stage-surface) 75%, transparent)",
                          borderColor: filled
                            ? "color-mix(in oklab, var(--neon-magenta) 55%, transparent)"
                            : isCursor
                              ? "color-mix(in oklab, var(--neon-cyan) 55%, transparent)"
                              : "color-mix(in oklab, white 14%, transparent)",
                          color: filled ? "white" : "color-mix(in oklab, white 20%, transparent)",
                          boxShadow: filled
                            ? "0 0 24px -8px color-mix(in oklab, var(--neon-magenta) 55%, transparent)"
                            : undefined,
                        }}
                      >
                        {filled ? ch : ""}
                      </span>
                    );
                  })}
                </div>
                <input
                  id="code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\s+/g, "").toUpperCase().slice(0, 6))}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="one-time-code"
                  inputMode="text"
                  aria-label="6-character join code"
                  className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none focus:outline-none"
                />
              </div>

              <p className="mt-4 text-center text-xs text-white/50">
                6 letters or numbers · not case-sensitive
              </p>

              <Button
                type="submit"
                disabled={loading || joinCode.length !== 6}
                className="mt-6 h-12 w-full text-base font-bold uppercase tracking-[0.12em]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                  color: "oklch(0.1 0.02 270)",
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 40%, transparent), 0 16px 40px -12px color-mix(in oklab, var(--neon-magenta) 60%, transparent)",
                }}
              >
                {loading ? "Joining…" : "Enter game"}
              </Button>
            </form>
          )}
        </SignedIn>

        <p className="mt-8 text-center text-xs text-white/40">
          Don&rsquo;t have a code?{" "}
          <Link href="/games/upcoming" className="font-semibold text-white/70 hover:text-white">
            See upcoming games
          </Link>
        </p>
      </div>
    </div>
  );
}
