import { SignUpFlow } from "@/components/auth/SignUpFlow";

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--stage-bg)] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgb(34 211 238 / 0.18), transparent 55%), radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.55) 100%)",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-6 py-10">
        <SignUpFlow />
      </div>
    </div>
  );
}
