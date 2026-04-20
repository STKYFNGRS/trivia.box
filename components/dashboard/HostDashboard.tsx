import Link from "next/link";
import { Gamepad2, Layers } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function HostDashboard(props: { subscriptionActive: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gamepad2 className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Organizer tools</CardTitle>
          </div>
          <CardDescription>
            Your organizer profile is already a default game location. Linked venue rooms appear
            here when a venue invites you by email.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            {props.subscriptionActive ? (
              <Link href="/dashboard/games/new" className={cn(buttonVariants())}>
                New game setup
              </Link>
            ) : (
              <Button type="button" disabled>
                New game setup
              </Button>
            )}
            <Link href="/dashboard/games" className={cn(buttonVariants({ variant: "secondary" }))}>
              Past games
            </Link>
          </div>
          <p className="text-xs">
            Add physical rooms you host from inside game setup — no separate account required.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Decks</CardTitle>
          </div>
          <CardDescription>
            Build reusable question decks. Keep them private, or submit one for public review so
            other hosts can pull from it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/decks"
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              My decks
            </Link>
          </div>
          <p className="text-xs">
            Decks pair perfectly with pinned rounds in game setup.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
