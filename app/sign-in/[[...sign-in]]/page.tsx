import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { cinematicClerkAppearance } from "@/components/auth/clerkAppearance";

export default function Page() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--stage-bg)] p-6 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgb(34 211 238 / 0.18), transparent 55%), radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.55) 100%)",
        }}
      />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <Link
          href="/"
          className="mb-8 text-sm font-semibold uppercase tracking-[0.28em] text-white/70 hover:text-white"
        >
          trivia.box
        </Link>
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          forceRedirectUrl="/dashboard"
          appearance={cinematicClerkAppearance}
        />
      </div>
    </div>
  );
}
