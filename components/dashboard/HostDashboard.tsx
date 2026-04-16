import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HostDashboard(props: { subscriptionActive: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Organizer tools</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Run games from your profile or linked venue locations. When a venue invites you by email, their room
            appears here automatically.
          </p>
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
        </CardContent>
      </Card>
    </div>
  );
}
