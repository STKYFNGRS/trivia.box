"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Player-dashboard upsell. Clicking "Become a host" sends players to the
 * interstitial (`/dashboard/player/upgrade`) rather than directly to Stripe,
 * so we can show the pitch and benefits before redirecting them away.
 */
export function BecomeHostCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Run your own trivia nights</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
        <p>
          Organize live games in minutes. $50/month unlocks host tools, a public game listing, QR join codes, and
          a curated question library.
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>Unlimited games &mdash; one room or many.</li>
          <li>Mobile player view, tablet host controls, TV display mode.</li>
          <li>Vetted question bank, grouped by category and subcategory.</li>
          <li>Your player profile and stats stay exactly where they are.</li>
        </ul>
        <div>
          <Link
            href="/dashboard/player/upgrade"
            className={cn(buttonVariants(), "inline-flex")}
          >
            Become a host &mdash; $50/month
          </Link>
        </div>
        <p className="text-xs">
          Cancel anytime. If you cancel, your account reverts to a player profile automatically.
        </p>
      </CardContent>
    </Card>
  );
}
