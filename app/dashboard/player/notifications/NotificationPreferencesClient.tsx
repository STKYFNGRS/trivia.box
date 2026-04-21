"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell, Gift, MailCheck, Megaphone, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Preferences = {
  prizeWon: boolean;
  weeklyDigest: boolean;
  upcomingSessions: boolean;
  marketing: boolean;
  unsubscribedAllAt: string | null;
};

const ROWS: Array<{
  key: keyof Omit<Preferences, "unsubscribedAllAt">;
  title: string;
  description: string;
  icon: (props: { className?: string }) => React.ReactNode;
}> = [
  {
    key: "prizeWon",
    title: "Prize won",
    description:
      "Immediately when you finish top-3 at a venue with a prize, so you can redeem the code before you leave.",
    icon: ({ className }) => <Gift className={className} aria-hidden />,
  },
  {
    key: "upcomingSessions",
    title: "Upcoming games at your venues",
    description:
      "A heads-up when a venue you've played at schedules a new live round in the next 24 hours.",
    icon: ({ className }) => <Bell className={className} aria-hidden />,
  },
  {
    key: "weeklyDigest",
    title: "Weekly trivia recap",
    description:
      "Every Monday: games played, XP gained, new trophies, and what's coming up.",
    icon: ({ className }) => <Trophy className={className} aria-hidden />,
  },
  {
    key: "marketing",
    title: "Occasional Trivia.Box news",
    description:
      "Launch announcements and seasonal events. Default off — we don't blast.",
    icon: ({ className }) => <Megaphone className={className} aria-hidden />,
  },
];

export function NotificationPreferencesClient({
  initial,
  accountEmail,
}: {
  initial: Preferences;
  accountEmail: string;
}) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [pending, startTransition] = useTransition();

  // Surface the "you're currently unsubscribed from everything" banner if the
  // server round-trip reports it. We keep the toggles interactive so one
  // click can re-opt-in.
  useEffect(() => {
    setPrefs(initial);
  }, [initial]);

  async function patch(field: keyof Omit<Preferences, "unsubscribedAllAt">, value: boolean) {
    const previous = prefs;
    const next: Preferences = { ...prefs, [field]: value, unsubscribedAllAt: null };
    setPrefs(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/me/player/notifications", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { preferences: Preferences };
        setPrefs(body.preferences);
      } catch (err) {
        setPrefs(previous);
        toast.error(
          err instanceof Error ? err.message : "Couldn't update preference"
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="flex items-start gap-3 pt-6">
          <MailCheck
            className="text-muted-foreground mt-0.5 size-5 shrink-0"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-foreground text-sm font-medium">
              Sending to <span className="font-mono">{accountEmail}</span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Update your email address from your Clerk account page if this
              isn&apos;t current.
            </p>
          </div>
        </CardContent>
      </Card>

      {prefs.unsubscribedAllAt ? (
        <Card className="border-amber-400/30 bg-amber-500/10 shadow-[var(--shadow-card)]">
          <CardContent className="pt-6">
            <p className="text-amber-200 text-sm">
              You previously unsubscribed from all Trivia.Box email. Flip any
              switch below to opt back in to that category.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="pt-6">
          <ul className="divide-border/70 divide-y">
            {ROWS.map((row) => {
              const checked = prefs[row.key];
              return (
                <li
                  key={row.key}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <row.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-foreground text-sm font-semibold">
                        {row.title}
                      </h3>
                      <Switch
                        checked={checked}
                        onCheckedChange={(v: boolean) => patch(row.key, v)}
                        disabled={pending}
                        aria-label={`Toggle ${row.title}`}
                      />
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {row.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
