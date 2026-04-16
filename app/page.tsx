import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-3">
        <div className="text-sm font-medium text-muted-foreground">trivia.box</div>
        <h1 className="text-4xl font-semibold tracking-tight">Bar trivia, built for organizers and players.</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Run live trivia nights with player, host, and TV display views — synced in realtime. Traveling hosts and
          venue teams use the same $50/month plan with the same features.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Playing tonight? You do not need an account —{" "}
          <Link href="/join" className="text-foreground font-medium underline underline-offset-4">
            join with your six-letter code
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/sign-up" className={cn(buttonVariants())}>
          Sign up
        </Link>
        <Link href="/sign-in" className={cn(buttonVariants({ variant: "outline" }))}>
          Sign in
        </Link>
      </div>
    </div>
  );
}
