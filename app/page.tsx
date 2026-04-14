import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-3">
        <div className="text-sm font-medium text-muted-foreground">trivia.box</div>
        <h1 className="text-4xl font-semibold tracking-tight">Bar trivia, built for hosts and venues.</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Run live trivia nights with player, host, and TV display views — synced in realtime. $50/month, same
          features for everyone.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/sign-up?kind=host" className={cn(buttonVariants())}>
          Start as a host
        </Link>
        <Link href="/sign-up?kind=venue" className={cn(buttonVariants({ variant: "secondary" }))}>
          Start as a venue
        </Link>
        <Link href="/sign-in" className={cn(buttonVariants({ variant: "outline" }))}>
          Sign in
        </Link>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Dashboard
        </Link>
        <Link href="/join" className={cn(buttonVariants({ variant: "outline" }))}>
          Join a game
        </Link>
      </div>
    </div>
  );
}
