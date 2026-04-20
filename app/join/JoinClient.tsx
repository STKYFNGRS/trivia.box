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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--stage-bg)] px-6 py-12 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgb(34 211 238 / 0.18), transparent 55%), radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.55) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-xl">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80 ring-1 ring-white/15 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Ready to play
          </span>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Enter the join code</h1>
          <p className="mt-2 text-sm text-white/70 md:text-base">
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
                  className="h-11 w-full bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
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

              <div className="relative mt-3 rounded-xl ring-1 ring-white/10 transition focus-within:ring-2 focus-within:ring-[var(--stage-accent)]">
                <div
                  aria-hidden
                  className="pointer-events-none flex select-none items-center justify-center gap-2 py-2 font-mono text-5xl font-black uppercase tracking-[0.35em] text-white md:text-6xl"
                >
                  {padded.split("").map((ch, i) => (
                    <span
                      key={i}
                      className={
                        i < joinCode.length
                          ? "inline-block min-w-[0.8ch] text-white"
                          : "inline-block min-w-[0.8ch] text-white/20"
                      }
                    >
                      {ch}
                    </span>
                  ))}
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
                className="mt-6 h-12 w-full bg-[var(--stage-accent)] text-base font-semibold text-slate-950 hover:bg-[var(--stage-accent)]/90"
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
