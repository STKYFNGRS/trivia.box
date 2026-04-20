"use client";

import { SignUp } from "@clerk/nextjs";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cinematicClerkAppearance } from "@/components/auth/clerkAppearance";
import { cn } from "@/lib/utils";

type Step = "profile" | "clerk";

const USERNAME_RE = /^[a-zA-Z0-9_-]{2,24}$/;

export function SignUpFlow() {
  const [step, setStep] = useState<Step>("profile");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [touched, setTouched] = useState<{ username?: boolean; displayName?: boolean; city?: boolean }>({});

  const usernameValue = username.trim();
  const displayNameValue = displayName.trim();
  const cityValue = city.trim();

  const usernameOk = USERNAME_RE.test(usernameValue);
  const displayNameOk = displayNameValue.length > 1;
  const cityOk = cityValue.length > 1;
  const canContinue = usernameOk && displayNameOk && cityOk;

  const unsafeMetadata = useMemo(
    () => ({
      account_type: "player" as const,
      name: displayNameValue,
      city: cityValue,
      player_username: usernameValue.toLowerCase(),
    }),
    [displayNameValue, cityValue, usernameValue]
  );

  const currentStep = step === "profile" ? 1 : 2;

  return (
    <div className="flex w-full max-w-lg flex-col gap-6 pb-24">
      <ProgressHeader step={currentStep} />

      {step === "profile" ? (
        <>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Create your player profile</h1>
            <p className="mt-2 text-sm text-white/70">
              Everyone starts as a player. Want to run games? Upgrade to a $50/month host plan from
              your dashboard after signing in.
            </p>
          </div>

          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Player identity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username" className="text-white/80">
                  Username
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="letters, numbers, _ or -"
                  aria-invalid={touched.username && !usernameOk ? true : undefined}
                  className="border-white/15 bg-white/[0.06] text-white placeholder:text-white/40"
                />
                {touched.username && !usernameOk ? (
                  <p className="text-xs font-medium text-rose-300">
                    Use 2–24 characters: letters, numbers, underscores, or hyphens.
                  </p>
                ) : (
                  <p className="text-xs text-white/60">
                    2–24 characters. Shown on leaderboards and your public profile.
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="display" className="text-white/80">
                  Display name
                </Label>
                <Input
                  id="display"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, displayName: true }))}
                  autoComplete="nickname"
                  placeholder="Shown on the big screen during games"
                  aria-invalid={touched.displayName && !displayNameOk ? true : undefined}
                  className="border-white/15 bg-white/[0.06] text-white placeholder:text-white/40"
                />
                {touched.displayName && !displayNameOk ? (
                  <p className="text-xs font-medium text-rose-300">
                    Pick a display name at least 2 characters long.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Where do you play?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="city" className="text-white/80">
                  City
                </Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, city: true }))}
                  autoComplete="address-level2"
                  aria-invalid={touched.city && !cityOk ? true : undefined}
                  className="border-white/15 bg-white/[0.06] text-white placeholder:text-white/40"
                />
                {touched.city && !cityOk ? (
                  <p className="text-xs font-medium text-rose-300">
                    Enter the city where you&rsquo;ll usually play trivia.
                  </p>
                ) : (
                  <p className="text-xs text-white/60">
                    Helps us surface upcoming games near you.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <p className="text-sm text-white/70">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-semibold text-white underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>

          <StickyFooter>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
            <Button
              type="button"
              disabled={!canContinue}
              onClick={() => {
                setTouched({ username: true, displayName: true, city: true });
                if (canContinue) setStep("clerk");
              }}
              className="h-11 bg-[var(--stage-accent)] px-5 text-slate-950 hover:bg-[var(--stage-accent)]/90"
            >
              Continue to email verification
            </Button>
          </StickyFooter>
        </>
      ) : null}

      {step === "clerk" ? (
        <>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Verify your email</h1>
            <p className="mt-2 text-sm text-white/70">
              We&rsquo;ll send a one-time code to finish setting up{" "}
              <span className="font-semibold text-white">@{usernameValue.toLowerCase()}</span>.
            </p>
          </div>

          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            unsafeMetadata={unsafeMetadata}
            forceRedirectUrl="/dashboard/player"
            appearance={cinematicClerkAppearance}
          />

          <StickyFooter>
            <button
              type="button"
              onClick={() => setStep("profile")}
              className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to profile
            </button>
            <span className="text-xs text-white/50">
              Your profile details are saved and will attach to your account.
            </span>
          </StickyFooter>
        </>
      ) : null}
    </div>
  );
}

function ProgressHeader({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1, label: "Your profile" },
    { n: 2, label: "Verify email" },
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
        Step {step} of 2 · {steps[step - 1].label}
      </div>
      <div className="flex items-center gap-2">
        {steps.map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <div key={s.n} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ring-1",
                  done && "bg-[var(--stage-accent)] text-slate-950 ring-[var(--stage-accent)]",
                  active &&
                    "bg-white text-slate-950 ring-white shadow-[0_0_0_4px_rgb(255_255_255_/_0.08)]",
                  !done && !active && "bg-white/[0.06] text-white/60 ring-white/10"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : s.n}
              </div>
              <div
                className={cn(
                  "text-xs font-medium",
                  active ? "text-white" : done ? "text-white/80" : "text-white/50"
                )}
              >
                {s.label}
              </div>
              {i < steps.length - 1 ? (
                <div
                  className={cn(
                    "ml-1 h-px flex-1",
                    done ? "bg-[var(--stage-accent)]" : "bg-white/10"
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StickyFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[color:color-mix(in_oklch,var(--stage-bg),transparent_15%)] backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-6 py-3">
        {children}
      </div>
    </div>
  );
}
