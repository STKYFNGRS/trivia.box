import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cinematicClerkAppearance } from "@/components/auth/clerkAppearance";
import { FilmGrain } from "@/components/marketing/FilmGrain";

export default async function Page() {
  // Already signed-in visitors shouldn't see the sign-in screen — bounce them
  // straight to their player dashboard. This mirrors the auth-aware nav so we
  // never dead-end a logged-in user on a "sign in" surface.
  const { userId } = await auth();
  if (userId) redirect("/dashboard/player");
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--stage-bg)] p-6 text-white">
      <FilmGrain />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, color-mix(in oklab, var(--neon-magenta) 22%, transparent), transparent 55%), radial-gradient(ellipse at 80% 100%, color-mix(in oklab, var(--neon-cyan) 18%, transparent), transparent 55%)",
        }}
      />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <Link
          href="/"
          className="mb-8 inline-flex items-center text-white"
          aria-label="Back to trivia.box"
        >
          <Image
            src="/logo.png"
            alt="trivia.box"
            width={160}
            height={32}
            priority
            className="h-8 w-auto transition-opacity hover:opacity-90"
          />
        </Link>
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          forceRedirectUrl="/dashboard/player"
          appearance={cinematicClerkAppearance}
        />
      </div>
    </div>
  );
}
