import { SignUpFlow } from "@/components/auth/SignUpFlow";
import { FilmGrain } from "@/components/marketing/FilmGrain";

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--stage-bg)] text-white">
      <FilmGrain />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, color-mix(in oklab, var(--neon-magenta) 22%, transparent), transparent 55%), radial-gradient(ellipse at 80% 100%, color-mix(in oklab, var(--neon-cyan) 18%, transparent), transparent 55%)",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-6 py-10">
        <SignUpFlow />
      </div>
    </div>
  );
}
